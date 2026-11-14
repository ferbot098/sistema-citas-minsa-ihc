import { login, registerPaciente, saveSession } from './services/apiClient.js';
import { ROL_LABELS } from './config/api.config.js';
import { mostrarError, ocultarError, estadoBoton, marcarCampo, announce } from './shared/accessibility.js';

const btnLogin = document.getElementById('btn-login');
const formLogin = document.getElementById('form-login');
const btnRegister = document.getElementById('btn-register');
const formRegister = document.getElementById('form-register');

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