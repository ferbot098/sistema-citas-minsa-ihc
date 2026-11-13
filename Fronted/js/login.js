import { login, registerPaciente } from './services/apiClient.js';
import { ROL_LABELS } from './config/api.config.js';
import { mostrarError, ocultarError, estadoBoton, marcarCampo, announce } from './shared/accessibility.js';

const btnLogin = document.getElementById('btn-login');
const formLogin = document.getElementById('form-login');
const btnRegister = document.getElementById('btn-register');
const formRegister = document.getElementById('form-register');

const checkSession = () => {
    if (window.location.hash === '#registro') return;
    try {
        const session = JSON.parse(localStorage.getItem('minsa_session'));
        if (session && session.token && session.usuario) {
            const dest = session.usuario.rol === 'ADMIN' ? 'dashboard.html' : 'Minsa.html';
            window.location.replace(dest);
        }
    } catch (e) {}
};

window.addEventListener('load', checkSession);

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

    estadoBoton(btnLogin, true, 'Ingresar al sistema');
    try {
        const resultado = await login({ identificador: identificadorLimpio, password: password.value });
        const usuario = resultado.usuario;
        const rol = ROL_LABELS[usuario.rol] || usuario.rol;
        announce(`Acceso correcto. Bienvenido, ${usuario.nombres}. Rol ${rol}.`, 'polite');

        // LIMPIEZA TOTAL DEL LOCAL STORAGE ANTES DE ASIGNAR SESIÓN (Evita que roles se pisen)
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('minsa_session', JSON.stringify(resultado));

        const destino = usuario.rol === 'ADMIN' ? 'dashboard.html' : 'Minsa.html';
        
        estadoBoton(btnLogin, true, 'Ingresar al sistema');
        btnLogin.textContent = 'Acceso correcto. Redirigiendo…';
        window.setTimeout(() => {
            window.location.assign(destino);
        }, 700);
    } catch (error) {
        mostrarError('login', error.message || 'No fue posible iniciar sesión.');
        estadoBoton(btnLogin, false, 'Ingresar al sistema');
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
    const agree = document.getElementById('reg-agree');

    const dniLimpio = dni.value.trim();
    const nombresLimpio = nombres.value.trim();
    const telefonoLimpio = telefono.value.trim();
    let invalido = false;

    if (!/^\d{8}$/.test(dniLimpio)) { marcarCampo(dni, true); invalido = true; } else { marcarCampo(dni, false); }
    if (!nombresLimpio) { marcarCampo(nombres, true); invalido = true; } else { marcarCampo(nombres, false); }
    if (!email.value || !email.validity.valid) { marcarCampo(email, true); invalido = true; } else { marcarCampo(email, false); }
    if (telefonoLimpio && !/^[\d\s\-\+]{6,15}$/.test(telefonoLimpio)) { marcarCampo(telefono, true); invalido = true; } else { marcarCampo(telefono, false); }
    if (password.value.length < 4) { marcarCampo(password, true); invalido = true; } else { marcarCampo(password, false); }
    if (!agree.checked) { marcarCampo(agree, true); invalido = true; } else { marcarCampo(agree, false); }

    if (invalido) {
        mostrarError('register', 'Por favor, revise los campos marcados y acepte los términos.');
        return;
    }

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
        
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('minsa_session', JSON.stringify(resultado));

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

document.querySelectorAll('.demo-user').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const indice = parseInt(e.target.dataset.indice, 10);
        const identInput = document.getElementById('identificador');
        const passInput = document.getElementById('password');
        
        if (indice === 1 || indice === 2) { 
             identInput.value = 'admin@minsa.gob.pe';
             passInput.value = 'admin123';
        } else {
             identInput.value = '01812548';
             passInput.value = '123456';
        }
        
        document.getElementById('tab-login').click();
        
        identInput.parentElement.classList.add('highlight');
        passInput.parentElement.classList.add('highlight');
        setTimeout(() => {
            identInput.parentElement.classList.remove('highlight');
            passInput.parentElement.classList.remove('highlight');
            btnLogin.focus();
        }, 600);
    });
});