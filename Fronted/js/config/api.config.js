/**
 * @file Configuración central de la capa de red del frontend MINSA.
 * @description Resuelve la URL base de la API REST tanto en desarrollo local
 * como en un despliegue público. Prioridad de resolución:
 * 1. Parámetro de consulta `?api=https://dominio/api`.
 * 2. Variable global `window.MINSA_API_BASE`.
 * 3. Etiqueta `<meta name="api-base" content="https://dominio/api">`.
 * 4. En `localhost` o `127.0.0.1`: `http://localhost:3000/api`.
 * 5. En producción: `${window.location.origin}/api`.
 * @module config/api.config
 */

const LOCAL_API_BASE = 'http://localhost:3000/api';

/**
 * Normaliza una URL base eliminando espacios y barras finales.
 * @param {string} value URL a normalizar.
 * @returns {string} URL base sin barras finales.
 */
function normalizeBase(value) {
    return String(value ?? '')
        .trim()
        .replace(/\/+$/, '');
}

/**
 * Comprueba si un texto es una URL HTTP o HTTPS válida.
 * @param {string} value Texto a validar.
 * @returns {boolean} `true` si es una URL web válida.
 */
function isHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Determina la URL base de la API según el entorno de ejecución.
 * @returns {string} URL base absoluta de la API.
 */
function resolveApiBase() {
    const params = new URLSearchParams(window.location.search);
    const queryBase = params.get('api');
    if (queryBase && isHttpUrl(queryBase)) {
        return normalizeBase(queryBase);
    }

    if (typeof window.MINSA_API_BASE === 'string' && window.MINSA_API_BASE.trim()) {
        return normalizeBase(window.MINSA_API_BASE);
    }

    const meta = document.querySelector('meta[name="api-base"]');
    if (meta && meta.content.trim() && isHttpUrl(meta.content.trim())) {
        return normalizeBase(meta.content.trim());
    }

    const host = window.location.hostname;
    const protocolo = window.location.protocol;
    const isLocal = protocolo === 'file:' ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host === '';
    if (isLocal) {
        return LOCAL_API_BASE;
    }

    return normalizeBase(`${window.location.origin}/api`);
}

/**
 * URL base de la API REST.
 * @type {string}
 */
export const API_BASE = resolveApiBase();

/**
 * Tiempo máximo de espera para una petición HTTP en milisegundos.
 * @type {number}
 */
export const REQUEST_TIMEOUT_MS = 15000;

/**
 * Roles soportados por el sistema.
 * @readonly
 * @enum {string}
 */
export const ROLES = Object.freeze({
    PACIENTE: 'PACIENTE',
    EMPLEADO: 'EMPLEADO',
    ADMIN: 'ADMIN'
});

/**
 * Etiquetas legibles para cada rol.
 * @type {Readonly<Record<string, string>>}
 */
export const ROL_LABELS = Object.freeze({
    PACIENTE: 'Paciente',
    EMPLEADO: 'Personal asistencial',
    ADMIN: 'Administrador MINSA'
});

/**
 * Página de inicio asociada a cada rol.
 * @type {Readonly<Record<string, string>>}
 */
export const HOME_BY_ROLE = Object.freeze({
    PACIENTE: 'Minsa.html',
    EMPLEADO: 'empleado.html',
    ADMIN: 'dashboard.html'
});

/**
 * Credenciales de demostración para autocompletar el formulario de acceso.
 * @type {ReadonlyArray<{ etiqueta: string, rol: string, identificador: string, password: string, descripcion: string }>}
 */
export const DEMO_USERS = Object.freeze([
    {
        etiqueta: 'Paciente Don Telmo',
        rol: 'PACIENTE',
        identificador: '01812548',
        password: '123456',
        descripcion: 'Historial, reserva, reprogramación y cancelación.'
    },
    {
        etiqueta: 'Médico Dr. Mendoza',
        rol: 'EMPLEADO',
        identificador: 'cmendoza@minsa.gob.pe',
        password: 'med123',
        descripcion: 'Agenda asignada y registro de atención clínica.'
    },
    {
        etiqueta: 'Administrador MINSA',
        rol: 'ADMIN',
        identificador: 'admin@minsa.gob.pe',
        password: 'admin123',
        descripcion: 'Indicadores, citas y gestión de personal.'
    }
]);
