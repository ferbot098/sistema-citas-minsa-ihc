import { login, registerPaciente, saveSession } from './services/apiClient.js';
import { ROL_LABELS } from './config/api.config.js';
import { mostrarError, ocultarError, estadoBoton, marcarCampo, announce } from './shared/accessibility.js';

const btnLogin = document.getElementById('btn-login');
const formLogin = document.getElementById('form-login');
const btnRegister = document.getElementById('btn-register');
const formRegister = document.getElementById('form-register');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const panelLogin = document.getElementById('panel-login');
const panelRegister = document.getElementById('panel-register');

// Anunciar motivo de la sesión cerrada/expirada al llegar al login
(function anunciarEstadoSesion() {
    const params = new URLSearchParams(window.location.search);
    const estado = params.get('sesion');
    if (estado === 'cerrada') {
        announce('Su sesión ha sido cerrada correctamente.', 'polite');
    } else if (estado === 'expirada') {
        announce('Su sesión ha expirado. Por favor, inicie sesión nuevamente.', 'assertive');
    }
    // Limpiar el parámetro ?sesion= de la URL sin recargar la página
    if (estado) {
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('sesion');
            window.history.replaceState(null, '', url.toString());
        } catch { /* Algunos entornos restringen el historial. */ }
    }
})();

function limpiarSesionPreservandoAccesibilidad() {
    try {
        const prefs = JSON.parse(localStorage.getItem('minsa_a11y_preferences') || '{}');
        localStorage.clear();
        sessionStorage.clear();
        if (prefs && Object.keys(prefs).length) {
            localStorage.setItem('minsa_a11y_preferences', JSON.stringify(prefs));
        }
    } catch (e) {
        localStorage.clear();
        sessionStorage.clear();
    }
}

const DESTINOS_POR_ROL = Object.freeze({
    PACIENTE: 'Minsa.html',
    ADMIN: 'dashboard.html',
    EMPLEADO: 'empleado.html'
});

function borrarSesionInvalida() {
    try {
        localStorage.removeItem('minsa_session');
    } catch {
        /* El almacenamiento puede estar deshabilitado por el navegador. */
    }
}

const checkExistingSession = () => {
    let raw = null;
    try {
        raw = localStorage.getItem('minsa_session');
    } catch {
        return;
    }
    if (!raw) return;

    let session = null;
    try {
        session = JSON.parse(raw);
    } catch {
        borrarSesionInvalida();
        return;
    }

    const usuario = session && (session.usuario || session.USUARIO);
    if (!session || typeof session.token !== 'string' || !session.token || !usuario || !usuario.rol) {
        borrarSesionInvalida();
        return;
    }

    const destino = DESTINOS_POR_ROL[usuario.rol];
    if (!destino) {
        borrarSesionInvalida();
        return;
    }

    window.location.replace(destino);
};

window.addEventListener('load', checkExistingSession);

/**
 * Cambia entre la pestaña de inicio de sesión y la de registro.
 * @param {'login'|'registro'} modo Panel que debe mostrarse.
 * @param {boolean} [actualizarUrl=false] Si debe sincronizar el hash de la URL.
 * @returns {void}
 */
function activarModoAcceso(modo, actualizarUrl = false) {
    if (!tabLogin || !tabRegister || !panelLogin || !panelRegister) return;

    const esRegistro = modo === 'registro';

    if (actualizarUrl) {
        try {
            const url = esRegistro
                ? '#registro'
                : window.location.pathname + window.location.search;
            window.history.replaceState(null, '', url);
        } catch {
            /* Algunos navegadores restringen el historial en archivos locales. */
        }
    }

    tabLogin.setAttribute('aria-selected', String(!esRegistro));
    tabLogin.tabIndex = esRegistro ? -1 : 0;
    tabRegister.setAttribute('aria-selected', String(esRegistro));
    tabRegister.tabIndex = esRegistro ? 0 : -1;

    panelLogin.hidden = esRegistro;
    panelLogin.classList.toggle('is-active', !esRegistro);
    panelRegister.hidden = !esRegistro;
    panelRegister.classList.toggle('is-active', esRegistro);
}

function configurarPestanasAcceso() {
    if (!tabLogin || !tabRegister || !panelLogin || !panelRegister) return;

    tabLogin.addEventListener('click', () => activarModoAcceso('login', true));
    tabRegister.addEventListener('click', () => activarModoAcceso('registro', true));

    [tabLogin, tabRegister].forEach((tab) => {
        tab.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const siguiente = tab === tabLogin ? 'registro' : 'login';
                activarModoAcceso(siguiente, true);
                (siguiente === 'registro' ? tabRegister : tabLogin).focus();
            }
        });
    });

    const sincronizarConHash = () => {
        activarModoAcceso(window.location.hash === '#registro' ? 'registro' : 'login');
    };

    sincronizarConHash();
    window.addEventListener('hashchange', sincronizarConHash);
}

function configurarMostrarPassword() {
    document.querySelectorAll('.toggle-password').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.getAttribute('aria-controls'));
            if (!input) return;
            const visible = btn.getAttribute('aria-expanded') === 'true';
            input.type = visible ? 'password' : 'text';
            btn.setAttribute('aria-expanded', String(!visible));
            btn.textContent = visible ? 'Mostrar contraseña' : 'Ocultar contraseña';
        });
    });
}

configurarPestanasAcceso();
configurarMostrarPassword();

async function sendingLogin(event) {
    event.preventDefault();
    ocultarError('login');

    const identificador = document.getElementById('identificador');
    const password = document.getElementById('password');
    const identificadorLimpio = identificador.value.trim();

    let invalido = false;
    if (!identificadorLimpio) {
        marcarCampo(identificador, true);
        invalido = true;
    } else {
        marcarCampo(identificador, false);
    }
    if (!password.value) {
        marcarCampo(password, true);
        invalido = true;
    } else {
        marcarCampo(password, false);
    }

    if (invalido) {
        mostrarError('login', 'Complete su identificador y su contraseña para continuar.');
        (identificadorLimpio ? password : identificador).focus();
        return;
    }

    estadoBoton(btnLogin, true, 'Iniciar Sesión de Paciente');
    try {
        limpiarSesionPreservandoAccesibilidad();

        const resultado = await login({ identificador: identificadorLimpio, password: password.value });
        const usuario = resultado.usuario || resultado.USUARIO;
        if (!usuario) {
            throw new Error('La respuesta del servidor no incluyó los datos del usuario.');
        }

        const rol = ROL_LABELS[usuario.rol] || usuario.rol;
        announce(`Acceso correcto. Bienvenido, ${usuario.nombres}. Rol ${rol}.`, 'polite');

        saveSession(resultado.token, usuario);

        const destino = DESTINOS_POR_ROL[usuario.rol] || 'index.html';

        estadoBoton(btnLogin, true, 'Iniciar Sesión de Paciente');
        btnLogin.textContent = 'Acceso correcto. Redirigiendo…';
        window.setTimeout(() => {
            window.location.assign(destino);
        }, 700);
    } catch (error) {
        mostrarError('login', error.message || 'No fue posible iniciar sesión.');
        estadoBoton(btnLogin, false, 'Iniciar Sesión de Paciente');
        password.focus();
        password.select();
    }
}

async function sendingRegister(event) {
    event.preventDefault();
    ocultarError('register');

    const dni = document.getElementById('reg-dni');
    const nombres = document.getElementById('reg-nombres');
    const email = document.getElementById('reg-email');
    const telefono = document.getElementById('reg-telefono');
    const password = document.getElementById('reg-password');

    const dniLimpio = dni.value.trim();
    const nombresLimpio = nombres.value.trim();
    const telefonoLimpio = telefono.value.trim();
    let invalido = false;

    if (!/^\d{8}$/.test(dniLimpio)) { marcarCampo(dni, true); invalido = true; } else { marcarCampo(dni, false); }
    if (!nombresLimpio) { marcarCampo(nombres, true); invalido = true; } else { marcarCampo(nombres, false); }
    if (!email.value || !email.validity.valid) { marcarCampo(email, true); invalido = true; } else { marcarCampo(email, false); }
    if (telefonoLimpio && !/^[\d\s\-\+]{6,15}$/.test(telefonoLimpio)) { marcarCampo(telefono, true); invalido = true; } else { marcarCampo(telefono, false); }
    if (password.value.length < 4) { marcarCampo(password, true); invalido = true; } else { marcarCampo(password, false); }

    if (invalido) {
        mostrarError('register', 'Por favor, revise los campos marcados.');
        return;
    }

    estadoBoton(btnRegister, true, 'Crear cuenta y continuar');
    try {
        limpiarSesionPreservandoAccesibilidad();

        const resultado = await registerPaciente({
            dni: dniLimpio,
            nombres: nombresLimpio,
            telefono: telefonoLimpio,
            email: email.value.trim(),
            password: password.value
        });
        const usuario = resultado.usuario || resultado.USUARIO || {
            dni: dniLimpio,
            nombres: nombresLimpio,
            email: email.value.trim(),
            rol: 'PACIENTE'
        };

        announce(`Cuenta creada correctamente. Bienvenido, ${usuario.nombres}.`, 'polite');
        saveSession(resultado.token, usuario);

        btnRegister.textContent = 'Cuenta creada. Redirigiendo…';
        window.setTimeout(() => {
            window.location.assign('Minsa.html');
        }, 800);
    } catch (error) {
        mostrarError('register', error.message || 'No fue posible crear la cuenta.');
        estadoBoton(btnRegister, false, 'Crear cuenta y continuar');
    }
}

if (formLogin) { formLogin.addEventListener('submit', sendingLogin); }
if (formRegister) { formRegister.addEventListener('submit', sendingRegister); }