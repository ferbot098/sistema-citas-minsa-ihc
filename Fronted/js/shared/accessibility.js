/**
 * @file Utilidades de accesibilidad compartidas por todas las vistas MINSA.
 * @description Implementa los controles globales de alto contraste, texto grande
 * y lectura en voz alta con Web Speech API, además de regiones `aria-live`
 * reutilizables y utilidades de escapado de texto.
 * @module shared/accessibility
 */

/**
 * Clave de almacenamiento de preferencias de accesibilidad.
 * @type {string}
 */
const STORAGE_KEY = 'minsa_a11y_preferences';

/**
 * Estado de los controles de accesibilidad.
 * @type {{ contraste: boolean, textoGrande: boolean, hablando: boolean }}
 */
const estado = {
    contraste: false,
    textoGrande: false,
    hablando: false
};

/**
 * Lee las preferencias guardadas en `localStorage`.
 * @returns {{ contraste: boolean, textoGrande: boolean }} Preferencias.
 */
function leerPreferencias() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { contraste: false, textoGrande: false };
        }
        const data = JSON.parse(raw);
        return {
            contraste: Boolean(data.contraste),
            textoGrande: Boolean(data.textoGrande)
        };
    } catch {
        return { contraste: false, textoGrande: false };
    }
}

/**
 * Persiste las preferencias actuales.
 * @returns {void}
 */
function guardarPreferencias() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            contraste: estado.contraste,
            textoGrande: estado.textoGrande
        }));
    } catch {
        /* El almacenamiento puede estar deshabilitado; no se interrumpe la UI. */
    }
}

/**
 * Aplica las clases visuales y el estado `aria-pressed` de los botones.
 * @returns {void}
 */
function aplicarPreferencias() {
    const root = document.documentElement;
    root.classList.toggle('high-contrast', estado.contraste);
    root.classList.toggle('large-text', estado.textoGrande);
    root.classList.toggle('texto-grande', estado.textoGrande);

    const btnContraste = document.getElementById('btn-contrast');
    if (btnContraste) {
        btnContraste.setAttribute('aria-pressed', String(estado.contraste));
    }

    const btnTexto = document.getElementById('btn-text');
    if (btnTexto) {
        btnTexto.setAttribute('aria-pressed', String(estado.textoGrande));
    }

    const btnHablar = document.getElementById('btn-speak');
    if (btnHablar) {
        btnHablar.setAttribute('aria-pressed', String(estado.hablando));
    }
}

/**
 * Devuelve o crea una región dinámica `aria-live`.
 * @param {string} id Identificador de la región.
 * @param {'polite'|'assertive'} nivel Nivel de anuncio.
 * @returns {HTMLElement} Región lista para escribir.
 */
function obtenerRegion(id, nivel) {
    let region = document.getElementById(id);
    if (!region) {
        region = document.createElement('div');
        region.id = id;
        region.className = 'sr-only';
        region.setAttribute('aria-live', nivel);
        region.setAttribute('aria-atomic', 'true');
        region.setAttribute('role', nivel === 'assertive' ? 'alert' : 'status');
        document.body.appendChild(region);
    }
    return region;
}

/**
 * Anuncia un mensaje a lectores de pantalla mediante una región `aria-live`.
 * @param {string} message Mensaje a anunciar.
 * @param {'polite'|'assertive'} [politeness='polite'] Nivel de prioridad.
 * @returns {void}
 */
export function announce(message, politeness = 'polite') {
    const texto = String(message ?? '').trim();
    if (!texto) {
        return;
    }
    const region = politeness === 'assertive'
        ? obtenerRegion('aria-alertas', 'assertive')
        : obtenerRegion('aria-estado', 'polite');

    region.textContent = '';
    window.setTimeout(() => {
        region.textContent = texto;
    }, 80);
}

/**
 * Escapa caracteres especiales para inyectar texto de forma segura en HTML.
 * @param {unknown} value Valor a escapar.
 * @returns {string} Texto seguro.
 */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => {
        /** @type {Record<string, string>} */
        const mapa = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return mapa[character];
    });
}

/**
 * Divide un texto largo en fragmentos aptos para `speechSynthesis`.
 * @param {string} text Texto completo.
 * @param {number} [maxLength=180] Longitud máxima por fragmento.
 * @returns {string[]} Fragmentos de texto.
 */
function dividirTexto(text, maxLength = 180) {
    const limpio = text.replace(/\s+/g, ' ').trim();
    if (!limpio) {
        return [];
    }
    const oraciones = limpio.match(/[^.!?]+[.!?]?/g) || [limpio];
    /** @type {string[]} */
    const fragmentos = [];
    let actual = '';

    oraciones.forEach((oracion) => {
        const pieza = oracion.trim();
        if (!pieza) {
            return;
        }
        if ((actual + ' ' + pieza).trim().length > maxLength && actual) {
            fragmentos.push(actual.trim());
            actual = pieza;
        } else {
            actual = `${actual} ${pieza}`.trim();
            if (actual.length > maxLength) {
                fragmentos.push(actual.slice(0, maxLength));
                actual = actual.slice(maxLength);
            }
        }
    });

    if (actual.trim()) {
        fragmentos.push(actual.trim());
    }
    return fragmentos;
}

/**
 * Extrae el texto visible de la región principal de la página.
 * @returns {string} Texto plano.
 */
function obtenerTextoPrincipal() {
    const main = document.querySelector('main');
    const fuente = main || document.body;
    return (fuente.innerText || fuente.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Detiene la lectura en voz alta en curso.
 * @returns {void}
 */
function detenerLectura() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    estado.hablando = false;
    aplicarPreferencias();
}

/**
 * Lee la página actual en voz alta en español peruano.
 * @returns {void}
 */
function alternarLectura() {
    if (!('speechSynthesis' in window)) {
        announce('Su navegador no admite la lectura en voz alta. Puede usar las funciones de su lector de pantalla.', 'assertive');
        return;
    }

    if (estado.hablando) {
        detenerLectura();
        announce('Lectura en voz alta detenida.', 'polite');
        return;
    }

    const texto = obtenerTextoPrincipal();
    if (!texto) {
        announce('No se encontró contenido para leer en esta página.', 'assertive');
        return;
    }

    const fragmentos = dividirTexto(texto);
    if (fragmentos.length === 0) {
        announce('No se encontró contenido para leer en esta página.', 'assertive');
        return;
    }

    window.speechSynthesis.cancel();
    estado.hablando = true;
    aplicarPreferencias();
    announce('Iniciando lectura de la página en voz alta.', 'polite');

    fragmentos.forEach((fragmento, index) => {
        const utterance = new SpeechSynthesisUtterance(fragmento);
        utterance.lang = 'es-PE';
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.onend = () => {
            if (index === fragmentos.length - 1) {
                estado.hablando = false;
                aplicarPreferencias();
                announce('Lectura de la página finalizada.', 'polite');
            }
        };
        utterance.onerror = () => {
            estado.hablando = false;
            aplicarPreferencias();
            announce('La lectura en voz alta se interrumpió. Intente nuevamente.', 'assertive');
        };
        window.speechSynthesis.speak(utterance);
    });
}

/**
 * Conecta los botones globales de accesibilidad declarados en la cabecera.
 * @returns {void}
 */
function conectarControles() {
    const btnContraste = document.getElementById('btn-contrast');
    if (btnContraste && !btnContraste.dataset.bound) {
        btnContraste.dataset.bound = 'true';
        btnContraste.addEventListener('click', () => {
            estado.contraste = !estado.contraste;
            aplicarPreferencias();
            guardarPreferencias();
            announce(
                estado.contraste ? 'Alto contraste activado.' : 'Alto contraste desactivado.',
                'polite'
            );
        });
    }

    const btnTexto = document.getElementById('btn-text');
    if (btnTexto && !btnTexto.dataset.bound) {
        btnTexto.dataset.bound = 'true';
        btnTexto.addEventListener('click', () => {
            estado.textoGrande = !estado.textoGrande;
            aplicarPreferencias();
            guardarPreferencias();
            announce(
                estado.textoGrande ? 'Texto grande activado.' : 'Texto grande desactivado.',
                'polite'
            );
        });
    }

    const btnHablar = document.getElementById('btn-speak');
    if (btnHablar && !btnHablar.dataset.bound) {
        btnHablar.dataset.bound = 'true';
        btnHablar.addEventListener('click', alternarLectura);
    }

    window.addEventListener('pagehide', detenerLectura);
}

/**
 * Inicializa las preferencias guardadas y los controles de cabecera.
 * Es idempotente: puede invocarse varias veces sin duplicar eventos.
 * @returns {void}
 */
export function initAccessibility() {
    const preferencias = leerPreferencias();
    estado.contraste = preferencias.contraste;
    estado.textoGrande = preferencias.textoGrande;
    aplicarPreferencias();
    conectarControles();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccessibility, { once: true });
} else {
    initAccessibility();
}

export { detenerLectura };
