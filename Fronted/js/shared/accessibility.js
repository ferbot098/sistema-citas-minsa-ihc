/**
 * @file Herramientas de accesibilidad y UI global (WCAG 2.1 AA/AAA)
 * @module accessibility
 */

export function announce(mensaje, prioridad = 'polite') {
    const contenedor = document.getElementById(prioridad === 'assertive' ? 'aria-alertas' : 'aria-estado');
    if (contenedor) {
        contenedor.textContent = '';
        setTimeout(() => {
            contenedor.textContent = mensaje;
        }, 50);
    }
}

export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function mostrarError(prefix, mensaje) {
    const alerta = document.getElementById(`${prefix}-alert`);
    const texto = document.getElementById(`${prefix}-alert-texto`);
    if (alerta && texto) {
        texto.textContent = mensaje;
        alerta.hidden = false;
        announce(mensaje, 'assertive');
    }
}

export function ocultarError(prefix) {
    const alerta = document.getElementById(`${prefix}-alert`);
    if (alerta) alerta.hidden = true;
}

export function estadoBoton(boton, cargando, textoOriginal) {
    if (!boton) return;
    boton.disabled = cargando;
    boton.textContent = cargando ? 'Procesando…' : textoOriginal;
    if (cargando) {
        boton.setAttribute('aria-busy', 'true');
    } else {
        boton.removeAttribute('aria-busy');
    }
}

export function marcarCampo(campo, invalido) {
    if (!campo) return;
    if (invalido) {
        campo.setAttribute('aria-invalid', 'true');
    } else {
        campo.removeAttribute('aria-invalid');
    }
}

export function formatFecha(fechaIso) {
    if (!fechaIso) return '';
    try {
        const partes = fechaIso.split('-').map(Number);
        const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
        return new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(fecha);
    } catch {
        return fechaIso;
    }
}

export function formatHora(hora) {
    if (!hora) return '';
    try {
        let [h, m] = hora.split(':');
        h = parseInt(h, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
    } catch {
        return hora;
    }
}

export function formatDateTime(fecha, hora) {
    return `${formatFecha(fecha)} · ${formatHora(hora)}`;
}

export function initDialogs() {
    document.querySelectorAll('[data-cerrar-dialog]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const dialog = document.getElementById(e.target.dataset.cerrarDialog);
            if (dialog) dialog.close();
        });
    });
}

export function openDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && !dialog.open) {
        dialog.showModal();
    }
}

export function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && dialog.open) {
        dialog.close();
    }
}

// Variables para la Web Speech API
let speechUtterance = null;
let isSpeaking = false;
let beforeUnloadRegistrado = false;

const A11Y_STORAGE_KEY = 'minsa_a11y_preferences';

/**
 * Lee las preferencias de accesibilidad almacenadas.
 * @returns {Record<string, any>} Preferencias seguras.
 */
function leerPreferenciasAccesibilidad() {
    try {
        const prefs = JSON.parse(localStorage.getItem(A11Y_STORAGE_KEY) || '{}');
        return prefs && typeof prefs === 'object' ? prefs : {};
    } catch {
        return {};
    }
}

/**
 * Guarda las preferencias de accesibilidad.
 * @param {Record<string, any>} prefs Preferencias a persistir.
 * @returns {void}
 */
function guardarPreferenciasAccesibilidad(prefs) {
    try {
        localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        /* El almacenamiento puede estar deshabilitado por el navegador. */
    }
}

/**
 * Reemplaza un botón por un clon limpio para eliminar listeners duplicados.
 * @param {HTMLElement|null} boton Botón original.
 * @returns {HTMLElement|null} Clon insertado en el DOM o `null`.
 */
function reemplazarBotonSinListeners(boton) {
    if (!boton || !boton.parentNode) return null;
    const clon = boton.cloneNode(true);
    boton.parentNode.replaceChild(clon, boton);
    return clon;
}

/**
 * Extrae texto legible de un contenedor eliminando nodos ruidosos.
 * @param {HTMLElement|null} contenedor Contenedor de origen.
 * @returns {string} Texto limpio para síntesis de voz.
 */
function extraerTextoLegible(contenedor) {
    if (!contenedor) return '';
    const clon = contenedor.cloneNode(true);
    clon.querySelectorAll('button, .sr-only, script, style, noscript, [aria-hidden="true"], [hidden]')
        .forEach((nodo) => nodo.remove());
    return (clon.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Detiene cualquier lectura en curso y restablece los botones de voz.
 * @returns {void}
 */
function detenerLectura() {
    speechUtterance = null;
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    isSpeaking = false;
    resetAllReadButtons();
}

/**
 * Lee un texto en voz alta. Si ya está hablando, lo detiene.
 * @param {string} text Texto a leer.
 * @param {HTMLElement|null} triggerButton Botón que disparó la acción.
 */
export function speakText(text, triggerButton = null) {
    if (!('speechSynthesis' in window)) {
        announce('La lectura en voz alta no está disponible en este navegador.');
        return;
    }

    // Si ya está hablando, detener la síntesis y resetear estados
    if (window.speechSynthesis.speaking) {
        speechUtterance = null;
        window.speechSynthesis.cancel();
        isSpeaking = false;
        resetAllReadButtons();
        // Si el botón presionado fue el que ya estaba leyendo, solo detenemos la lectura
        if (!text) return;
    }

    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    speechUtterance = utterance;
    utterance.lang = 'es-PE';
    utterance.rate = 0.95; // Un poco más lento para mejor comprensión
    
    // Buscar voz en español
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v => v.lang.startsWith('es-') && (v.name.includes('Peru') || v.name.includes('Latin'))) || voices.find(v => v.lang.startsWith('es'));
    if (spanishVoice) {
        utterance.voice = spanishVoice;
    }

    utterance.onstart = () => {
        if (speechUtterance !== utterance) return;
        isSpeaking = true;
        if (triggerButton) {
            triggerButton.innerHTML = '<span aria-hidden="true">⏹</span> Detener lectura';
            triggerButton.setAttribute('aria-pressed', 'true');
        }
    };

    utterance.onend = () => {
        if (speechUtterance !== utterance) return;
        speechUtterance = null;
        isSpeaking = false;
        resetAllReadButtons();
    };

    utterance.onerror = () => {
        if (speechUtterance !== utterance) return;
        speechUtterance = null;
        isSpeaking = false;
        resetAllReadButtons();
    };

    window.speechSynthesis.speak(utterance);
}

/**
 * Restaura el texto y estado de todos los botones de lectura.
 */
function resetAllReadButtons() {
    document.querySelectorAll('.btn-read-section').forEach(btn => {
        // Restaurar el aria-label original desde data-label (si existe) o el texto por defecto
        const textoOriginal = btn.dataset.labelOriginal || 'Escuchar sección';
        btn.innerHTML = `<span aria-hidden="true">🔊</span> ${textoOriginal}`;
        btn.setAttribute('aria-pressed', 'false');
    });

    const btnSpeak = document.getElementById('btn-speak');
    if (btnSpeak) {
        btnSpeak.innerHTML = '<span aria-hidden="true">🔊</span> Escuchar página';
        btnSpeak.setAttribute('aria-pressed', 'false');
    }
}

/**
 * Inicializa herramientas de accesibilidad (contraste, texto y lector de pantalla por sección).
 */
export function initAccessibility() {
    const prefs = leerPreferenciasAccesibilidad();
    const docEl = document.documentElement;

    // Cargar voces al inicio (es asíncrono en algunos navegadores)
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    // Clonar botones para eliminar listeners previos y evitar duplicados
    const btnContrast = reemplazarBotonSinListeners(document.getElementById('btn-contrast'));
    const btnText = reemplazarBotonSinListeners(document.getElementById('btn-text'));
    const btnSpeak = reemplazarBotonSinListeners(document.getElementById('btn-speak'));

    // Aplicar preferencias guardadas
    docEl.classList.toggle('high-contrast', Boolean(prefs.contraste));
    docEl.classList.toggle('large-text', Boolean(prefs.textoGrande));
    docEl.classList.toggle('texto-grande', Boolean(prefs.textoGrande));

    // Alto contraste
    if (btnContrast) {
        btnContrast.setAttribute('aria-pressed', String(Boolean(prefs.contraste)));
        btnContrast.addEventListener('click', () => {
            const activado = !docEl.classList.contains('high-contrast');
            docEl.classList.toggle('high-contrast', activado);
            btnContrast.setAttribute('aria-pressed', String(activado));

            const actuales = leerPreferenciasAccesibilidad();
            actuales.contraste = activado;
            guardarPreferenciasAccesibilidad(actuales);

            announce(`Modo de alto contraste ${activado ? 'activado' : 'desactivado'}.`);
        });
    }

    // Texto grande
    if (btnText) {
        btnText.setAttribute('aria-pressed', String(Boolean(prefs.textoGrande)));
        btnText.addEventListener('click', () => {
            const activado = !docEl.classList.contains('large-text');
            docEl.classList.toggle('large-text', activado);
            docEl.classList.toggle('texto-grande', activado);
            btnText.setAttribute('aria-pressed', String(activado));

            const actuales = leerPreferenciasAccesibilidad();
            actuales.textoGrande = activado;
            guardarPreferenciasAccesibilidad(actuales);

            announce(`Texto grande ${activado ? 'activado' : 'desactivado'}.`);
        });
    }

    // Leer la página completa desde <main id="contenido">
    if (btnSpeak) {
        btnSpeak.setAttribute('aria-pressed', 'false');
        btnSpeak.addEventListener('click', () => {
            if (btnSpeak.getAttribute('aria-pressed') === 'true') {
                detenerLectura();
                return;
            }

            const texto = extraerTextoLegible(document.getElementById('contenido'));
            if (!texto) {
                announce('No hay contenido disponible para leer.');
                return;
            }

            speakText(texto, btnSpeak);
        });
    }

    // Leer secciones específicas
    document.querySelectorAll('.btn-read-section').forEach((boton) => {
        // Guardar el texto visible original para poder restaurarlo correctamente
        const textoVisible = (boton.textContent || '').trim();
        if (textoVisible && !boton.dataset.labelOriginal) {
            boton.dataset.labelOriginal = textoVisible;
        }

        const nuevoBoton = reemplazarBotonSinListeners(boton);
        if (!nuevoBoton) return;

        // Preservar el label en el nodo clonado
        if (!nuevoBoton.dataset.labelOriginal && textoVisible) {
            nuevoBoton.dataset.labelOriginal = textoVisible;
        }

        nuevoBoton.setAttribute('aria-pressed', 'false');
        nuevoBoton.addEventListener('click', () => {
            if (nuevoBoton.getAttribute('aria-pressed') === 'true') {
                detenerLectura();
                return;
            }

            const targetId = nuevoBoton.getAttribute('data-target');
            const seccion = targetId ? document.getElementById(targetId) : null;
            const texto = extraerTextoLegible(seccion);

            if (!texto) {
                announce('No hay contenido disponible para leer en esta sección.');
                return;
            }

            speakText(texto, nuevoBoton);
        });
    });

    // Normalizar etiquetas de lectura tras una posible reinicialización
    resetAllReadButtons();

    // Detener lectura si se cambia de página o se cierra
    if (!beforeUnloadRegistrado) {
        window.addEventListener('beforeunload', () => {
            if (window.speechSynthesis) window.speechSynthesis.cancel();
        });
        beforeUnloadRegistrado = true;
    }
}

initAccessibility();