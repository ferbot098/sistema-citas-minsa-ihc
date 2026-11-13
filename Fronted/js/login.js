/**
 * @file Lógica del acceso unificado y del registro de pacientes.
 * @description Gestiona las pestañas accesibles, el autocompletado de cuentas
 * de demostración, la validación de formularios y la redirección por rol.
 * @module login
 */

import { DEMO_USERS, HOME_BY_ROLE, ROL_LABELS } from './config/api.config.js';
import {
    login,
    registerPaciente,
    isAuthenticated,
    getUsuario,
    getHomeForUser
} from './services/apiClient.js';
import { initAccessibility, announce } from './shared/accessibility.js';

const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const panelLogin = document.getElementById('panel-login');
const panelRegister = document.getElementById('panel-register');
const formLogin = document.getElementById('form-login');
const formRegister = document.getElementById('form-register');
const loginAlert = document.getElementById('login-alert');
const loginAlertTexto = document.getElementById('login-alert-texto');
const registerAlert = document.getElementById('register-alert');
const registerAlertTexto = document.getElementById('register-alert-texto');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnContinuar = document.getElementById('btn-continuar');
const sesionActiva = document.getElementById('sesion-activa');
const sesionActivaTexto = document.getElementById('sesion-activa-texto');
const avisoUrl = document.getElementById('aviso-url');
const avisoUrlTexto = document.getElementById('aviso-url-texto');

/**
 * Activa una pestaña y su panel correspondiente.
 * @param {'login'|'register'} nombre Pestaña a mostrar.
 * @param {boolean} [moverFoco=true] Si debe mover el foco al panel.
 * @returns {void}
 */
function activarTab(nombre, moverFoco = true) {
    const esLogin = nombre === 'login';
    tabLogin.setAttribute('aria-selected', String(esLogin));
    tabLogin.tabIndex = esLogin ? 0 : -1;
    tabRegister.setAttribute('aria-selected', String(!esLogin));
    tabRegister.tabIndex = esLogin ? -1 : 0;
    panelLogin.hidden = !esLogin;
    panelRegister.hidden = esLogin;

    if (moverFoco) {
        const panel = esLogin ? panelLogin : panelRegister;
        panel.focus();
    }
}

/**
 * Habilita la navegación por flechas entre las pestañas.
 * @param {KeyboardEvent} event Evento de teclado.
 * @returns {void}
 */
function manejarTeclasTab(event) {
    const teclas = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!teclas.includes(event.key)) {
        return;
    }
    event.preventDefault();
    const actualEsLogin = tabLogin.getAttribute('aria-selected') === 'true';
    let nuevo = actualEsLogin ? tabRegister : tabLogin;
    if (event.key === 'Home') {
        nuevo = tabLogin;
    } else if (event.key === 'End') {
        nuevo = tabRegister;
    }
    nuevo.focus();
    activarTab(nuevo === tabLogin ? 'login' : 'register', false);
}

/**
 * Muestra un mensaje de error dentro del formulario.
 * @param {'login'|'register'} tipo Formulario afectado.
 * @param {string} mensaje Texto del error.
 * @returns {void}
 */
function mostrarError(tipo, mensaje) {
    const contenedor = tipo === 'login' ? loginAlert : registerAlert;
    const texto = tipo === 'login' ? loginAlertTexto : registerAlertTexto;
    texto.textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, 'assertive');
}

/**
 * Oculta el mensaje de error de un formulario.
 * @param {'login'|'register'} tipo Formulario afectado.
 * @returns {void}
 */
function ocultarError(tipo) {
    const contenedor = tipo === 'login' ? loginAlert : registerAlert;
    contenedor.hidden = true;
}

/**
 * Marca un campo como inválido o válido para lectores de pantalla.
 * @param {HTMLInputElement} campo Campo a marcar.
 * @param {boolean} invalido Estado de validez.
 * @returns {void}
 */
function marcarCampo(campo, invalido) {
    if (invalido) {
        campo.setAttribute('aria-invalid', 'true');
    } else {
        campo.removeAttribute('aria-invalid');
    }
}

/**
 * Cambia el estado visual y semántico de un botón de envío.
 * @param {HTMLButtonElement} boton Botón a actualizar.
 * @param {boolean} cargando Estado de carga.
 * @param {string} textoOriginal Texto original del botón.
 * @returns {void}
 */
function estadoBoton(boton, cargando, textoOriginal) {
    boton.disabled = cargando;
    boton.setAttribute('aria-busy', String(cargando));
    boton.textContent = cargando ? 'Procesando…' : textoOriginal;
}

/**
 * Valida y envía el formulario de inicio de sesión.
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function enviarLogin(event) {
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

    estadoBoton(btnLogin, true, 'Ingresar al sistema');
    try {
        const resultado = await login({ identificador: identificadorLimpio, password: password.value });
        const usuario = resultado.usuario;
        const rol = ROL_LABELS[usuario.rol] || usuario.rol;
        announce(`Acceso correcto. Bienvenido, ${usuario.nombres}. Rol ${rol}.`, 'polite');
        estadoBoton(btnLogin, true, 'Ingresar al sistema');
        btnLogin.textContent = 'Acceso correcto. Redirigiendo…';
        window.setTimeout(() => {
            window.location.assign(getHomeForUser(usuario));
        }, 700);
    } catch (error) {
        mostrarError('login', error.message || 'No fue posible iniciar sesión.');
        estadoBoton(btnLogin, false, 'Ingresar al sistema');
        password.focus();
        password.select();
    }
}

/**
 * Valida y envía el formulario de registro de paciente.
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function enviarRegistro(event) {
    event.preventDefault();
    ocultarError('register');

    const dni = document.getElementById('reg-dni');
    const nombres = document.getElementById('reg-nombres');
    const telefono = document.getElementById('reg-telefono');
    const email = document.getElementById('reg-email');
    const password = document.getElementById('reg-password');
    const passwordConfirm = document.getElementById('reg-password-confirm');

    const dniLimpio = dni.value.trim();
    const nombresLimpio = nombres.value.trim();
    const telefonoLimpio = telefono.value.trim().replace(/\s+/g, '');

    /** @type {Array<{ campo: HTMLInputElement, valido: boolean, mensaje: string }>} */
    const validaciones = [
        { campo: dni, valido: /^\d{8}$/.test(dniLimpio), mensaje: 'El DNI debe tener exactamente 8 dígitos.' },
        { campo: nombres, valido: nombresLimpio.length >= 3, mensaje: 'Ingrese sus nombres y apellidos completos.' },
        { campo: telefono, valido: /^\d{7,15}$/.test(telefonoLimpio), mensaje: 'Ingrese un teléfono válido de 7 a 15 dígitos.' },
        { campo: password, valido: password.value.trim().length >= 4, mensaje: 'La contraseña debe tener al menos 4 caracteres.' },
        { campo: passwordConfirm, valido: passwordConfirm.value === password.value && passwordConfirm.value.length > 0, mensaje: 'La confirmación de la contraseña no coincide.' }
    ];

    const primerError = validaciones.find((item) => !item.valido);
    validaciones.forEach((item) => marcarCampo(item.campo, !item.valido));

    if (primerError) {
        mostrarError('register', primerError.mensaje);
        primerError.campo.focus();
        return;
    }

    if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        marcarCampo(email, true);
        mostrarError('register', 'Ingrese un correo electrónico válido o déjelo vacío.');
        email.focus();
        return;
    }
    marcarCampo(email, false);

    estadoBoton(btnRegister, true, 'Crear cuenta y continuar');
    try {
        const resultado = await registerPaciente({
            dni: dniLimpio,
            nombres: nombresLimpio,
            telefono: telefonoLimpio,
            email: email.value.trim(),
            password: password.value
        });
        announce(`Cuenta creada correctamente. Bienvenido, ${resultado.usuario.nombres}.`, 'polite');
        btnRegister.textContent = 'Cuenta creada. Redirigiendo…';
        window.setTimeout(() => {
            window.location.assign(HOME_BY_ROLE.PACIENTE);
        }, 800);
    } catch (error) {
        mostrarError('register', error.message || 'No fue posible crear la cuenta.');
        estadoBoton(btnRegister, false, 'Crear cuenta y continuar');
        dni.focus();
    }
}

/**
 * Rellena el formulario de acceso con una cuenta de demostración.
 * @param {number} indice Índice dentro de `DEMO_USERS`.
 * @returns {void}
 */
function autocompletarDemo(indice) {
    const demo = DEMO_USERS[indice];
    if (!demo) {
        return;
    }
    activarTab('login', false);
    const identificador = document.getElementById('identificador');
    const password = document.getElementById('password');
    identificador.value = demo.identificador;
    password.value = demo.password;
    marcarCampo(identificador, false);
    marcarCampo(password, false);
    ocultarError('login');
    announce(`Credenciales del rol ${demo.etiqueta} cargadas. ${demo.descripcion}`, 'polite');
    document.getElementById('btn-login').focus();
}

/**
 * Configura el botón para mostrar u ocultar la contraseña.
 * @returns {void}
 */
function configurarMostrarPassword() {
    const boton = document.getElementById('btn-toggle-password');
    const campo = document.getElementById('password');
    if (!boton || !campo) {
        return;
    }
    boton.addEventListener('click', () => {
        const visible = campo.type === 'text';
        campo.type = visible ? 'password' : 'text';
        boton.setAttribute('aria-pressed', String(!visible));
        boton.textContent = visible ? 'Mostrar contraseña' : 'Ocultar contraseña';
        announce(visible ? 'Contraseña oculta.' : 'Contraseña visible.', 'polite');
        campo.focus();
    });
}

/**
 * Muestra el aviso de sesión existente o los mensajes de estado recibidos por URL.
 * @returns {void}
 */
function mostrarEstadoInicial() {
    const params = new URLSearchParams(window.location.search);
    const estadoSesion = params.get('sesion');
    if (estadoSesion === 'expirada') {
        avisoUrlTexto.textContent = 'Su sesión expiró por seguridad. Vuelva a iniciar sesión.';
        avisoUrl.hidden = false;
        announce(avisoUrlTexto.textContent, 'assertive');
    } else if (estadoSesion === 'cerrada') {
        avisoUrlTexto.textContent = 'Su sesión se cerró correctamente. Gracias por usar el sistema.';
        avisoUrl.hidden = false;
    }

    if (estadoSesion) {
        params.delete('sesion');
        const query = params.toString();
        const nuevaUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
        window.history.replaceState({}, document.title, nuevaUrl);
    }

    if (isAuthenticated()) {
        const usuario = getUsuario();
        sesionActivaTexto.textContent = `Ya tiene una sesión activa como ${usuario.nombres} (${ROL_LABELS[usuario.rol] || usuario.rol}).`;
        sesionActiva.hidden = false;
    }
}

/**
 * Inicializa las pestañas, el autocompletado y los formularios.
 * @returns {void}
 */
function inicializar() {
    initAccessibility();
    configurarMostrarPassword();
    mostrarEstadoInicial();

    if (window.location.hash === '#registro') {
        activarTab('register', false);
        announce('Formulario de registro de paciente seleccionado.', 'polite');
    }

    tabLogin.addEventListener('click', () => activarTab('login'));
    tabRegister.addEventListener('click', () => activarTab('register'));
    [tabLogin, tabRegister].forEach((tab) => {
        tab.addEventListener('keydown', manejarTeclasTab);
    });

    formLogin.addEventListener('submit', enviarLogin);
    formRegister.addEventListener('submit', enviarRegistro);

    document.querySelectorAll('.demo-user').forEach((boton) => {
        boton.addEventListener('click', () => {
            autocompletarDemo(Number(boton.dataset.indice));
        });
    });

    if (btnContinuar) {
        btnContinuar.addEventListener('click', () => {
            window.location.assign(getHomeForUser(getUsuario()));
        });
    }
}

inicializar();
