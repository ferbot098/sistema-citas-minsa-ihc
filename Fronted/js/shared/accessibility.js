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

/**
 * Lee un texto en voz alta. Si ya está hablando, lo detiene.
 * @param {string} text Texto a leer.
 * @param {HTMLElement|null} triggerButton Botón que disparó la acción.
 */
export function speakText(text, triggerButton = null) {
    // Si ya está hablando, detener la síntesis y resetear estados
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        isSpeaking = false;
        resetAllReadButtons();
        // Si el botón presionado fue el que ya estaba leyendo, solo detenemos la lectura
        if (!text) return;
    }

    if (!text) return;

    speechUtterance = new SpeechSynthesisUtterance(text);
    speechUtterance.lang = 'es-PE';
    speechUtterance.rate = 0.95; // Un poco más lento para mejor comprensión
    
    // Buscar voz en español
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v => v.lang.startsWith('es-') && (v.name.includes('Peru') || v.name.includes('Latin'))) || voices.find(v => v.lang.startsWith('es'));
    if (spanishVoice) {
        speechUtterance.voice = spanishVoice;
    }

    speechUtterance.onstart = () => {
        isSpeaking = true;
        if (triggerButton) {
            triggerButton.innerHTML = '<span aria-hidden="true">⏹</span> Detener lectura';
            triggerButton.setAttribute('aria-pressed', 'true');
        }
    };

    speechUtterance.onend = () => {
        isSpeaking = false;
        resetAllReadButtons();
    };

    speechUtterance.onerror = () => {
        isSpeaking = false;
        resetAllReadButtons();
    };

    window.speechSynthesis.speak(speechUtterance);
}

/**
 * Restaura el texto y estado de todos los botones de lectura.
 */
function resetAllReadButtons() {
    document.querySelectorAll('.btn-read-section').forEach(btn => {
        btn.innerHTML = '<span aria-hidden="true">🔊</span> Escuchar sección';
        btn.setAttribute('aria-pressed', 'false');
    });
}

/**
 * Inicializa herramientas de accesibilidad (contraste, texto y lector de pantalla por sección).
 */
export function initAccessibility() {
    const prefs = JSON.parse(localStorage.getItem('minsa_a11y_preferences') || '{}');
    const docEl = document.documentElement;

    const btnContrast = document.getElementById('btn-contrast');
    const btnText = document.getElementById('btn-text');
    
    // Cargar voces al inicio (es asíncrono en algunos navegadores)
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    // Configurar estado inicial
    if (prefs.contraste) {
        docEl.classList.add('high-contrast');
        if (btnContrast) btnContrast.setAttribute('aria-pressed', 'true');
    }
    if (prefs.textoGrande) {
        docEl.classList.add('large-text', 'texto-grande');
        if (btnText) btnText.setAttribute('aria-pressed', 'true');
    }

    // Alto contraste
    if (btnContrast) {
        btnContrast.addEventListener('click', () => {
            const isPressed = btnContrast.getAttribute('aria-pressed') === 'true';
            btnContrast.setAttribute('aria-pressed', !isPressed);
            docEl.classList.toggle('high-contrast', !isPressed);
            
            const currentPrefs = JSON.parse(localStorage.getItem('minsa_a11y_preferences') || '{}');
            currentPrefs.contraste = !isPressed;
            localStorage.setItem('minsa_a11y_preferences', JSON.stringify(currentPrefs));
            
            announce(`Modo de alto contraste ${!isPressed ? 'activado' : 'desactivado'}.`);
        });
    }

    // Aumentar texto
    if (btnText) {
        btnText.addEventListener('click', () => {
            const isPressed = btnText.getAttribute('aria-pressed') === 'true';
            btnText.setAttribute('aria-pressed', !isPressed);
            docEl.classList.toggle('large-text', !isPressed);
            docEl.classList.toggle('texto-grande', !isPressed);
            
            const currentPrefs = JSON.parse(localStorage.getItem('minsa_a11y_preferences') || '{}');
            currentPrefs.textoGrande = !isPressed;
            localStorage.setItem('minsa_a11y_preferences', JSON.stringify(currentPrefs));
            
            announce(`Texto grande ${!isPressed ? 'activado' : 'desactivado'}.`);
        });
    }

    // Escuchar secciones específicas
    document.querySelectorAll('.btn-read-section').forEach(btn => {
        btn.addEventListener('click', () => {
            const isThisButtonSpeaking = btn.getAttribute('aria-pressed') === 'true';
            
            // Si este mismo botón estaba leyendo, se detiene la lectura
            if (isThisButtonSpeaking) {
                speakText(null); 
                return;
            }

            const targetId = btn.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                // Clonamos la sección para limpiarla antes de leerla
                const clone = targetSection.cloneNode(true);
                // Removemos los botones de lectura del clon para que no lea "Escuchar sección"
                clone.querySelectorAll('.btn-read-section').forEach(b => b.remove());
                
                // Extraer el texto limpio
                const cleanText = clone.innerText || clone.textContent;
                speakText(cleanText, btn);
                announce('Iniciando lectura de la sección.');
            }
        });
    });

    // Detener lectura si se cambia de página o se cierra
    window.addEventListener('beforeunload', () => {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    });
}

initAccessibility();