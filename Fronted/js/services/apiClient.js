/**
 * @file Cliente HTTP del frontend MINSA.
 * @description Centraliza el consumo de la API REST con `fetch`, manejo de JWT,
 * expiración de sesión, tiempos de espera y traducción de errores a mensajes
 * accesibles en español.
 * @module services/apiClient
 */

import { API_BASE, REQUEST_TIMEOUT_MS, HOME_BY_ROLE } from '../config/api.config.js';

/**
 * Clave de almacenamiento de la sesión en `localStorage`.
 * @type {string}
 */
const SESSION_KEY = 'minsa_session';

/**
 * Error controlado producido por una respuesta HTTP fallida de la API.
 */
export class ApiError extends Error {
    /**
     * @param {string} message Mensaje legible para la persona usuaria.
     * @param {number} status Código de estado HTTP.
     * @param {unknown} [payload] Cuerpo de la respuesta.
     */
    constructor(message, status, payload = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.payload = payload;
    }
}

/**
 * Recupera la sesión almacenada.
 * @returns {{ token: string, usuario: Record<string, any> } | null} Sesión o `null`.
 */
export function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.token !== 'string' || !parsed.usuario) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Guarda la sesión autenticada.
 * @param {string} token Token JWT.
 * @param {Record<string, any>} usuario Datos del usuario autenticado.
 * @returns {void}
 */
export function saveSession(token, usuario) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, usuario }));
}

/**
 * Elimina la sesión almacenada.
 * @returns {void}
 */
export function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

/**
 * Devuelve el token JWT activo.
 * @returns {string | null} Token o `null`.
 */
export function getToken() {
    const session = getSession();
    return session ? session.token : null;
}

/**
 * Devuelve el usuario autenticado.
 * @returns {Record<string, any> | null} Usuario o `null`.
 */
export function getUsuario() {
    const session = getSession();
    return session ? session.usuario : null;
}

/**
 * Indica si existe una sesión con token.
 * @returns {boolean} `true` si hay sesión.
 */
export function isAuthenticated() {
    return Boolean(getToken() && getUsuario());
}

/**
 * Comprueba si el usuario actual posee alguno de los roles indicados.
 * @param {...string} roles Roles permitidos.
 * @returns {boolean} `true` si el rol está permitido.
 */
export function hasRole(...roles) {
    const usuario = getUsuario();
    return Boolean(usuario && roles.includes(usuario.rol));
}

/**
 * Página de destino luego de iniciar sesión.
 * @param {Record<string, any> | null} usuario Usuario autenticado.
 * @returns {string} Ruta de inicio.
 */
export function getHomeForUser(usuario) {
    if (usuario && HOME_BY_ROLE[usuario.rol]) {
        return HOME_BY_ROLE[usuario.rol];
    }
    return 'login.html';
}

/**
 * Protege una vista exigiendo sesión y, opcionalmente, roles concretos.
 * Si no hay sesión redirige al login; si el rol no coincide redirige a su portal.
 * @param {string[]} [rolesPermitidos] Roles autorizados para la vista.
 * @returns {Record<string, any> | null} Usuario autenticado o `null` si redirigió.
 */
export function requireRole(rolesPermitidos = []) {
    const usuario = getUsuario();
    if (!usuario || !getToken()) {
        const destino = encodeURIComponent(window.location.pathname.split('/').pop() || 'index.html');
        window.location.replace(`login.html?redir=${destino}`);
        return null;
    }
    if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(usuario.rol)) {
        window.location.replace(getHomeForUser(usuario));
        return null;
    }
    return usuario;
}

/**
 * Cierra la sesión y redirige al login.
 * @param {boolean} [redirigir=true] Si debe navegar al login.
 * @returns {void}
 */
export function logout(redirigir = true) {
    clearSession();
    if (redirigir) {
        window.location.replace('login.html?sesion=cerrada');
    }
}

/**
 * Construye una cadena de consulta omitiendo valores vacíos.
 * @param {Record<string, string | number | undefined | null>} params Parámetros.
 * @returns {string} Cadena `?a=b` o cadena vacía.
 */
function buildQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            search.set(key, String(value));
        }
    });
    const query = search.toString();
    return query ? `?${query}` : '';
}

/**
 * Realiza una petición HTTP a la API.
 * @param {string} path Ruta relativa que inicia con `/`.
 * @param {{ method?: string, body?: unknown, auth?: boolean }} [options] Opciones.
 * @returns {Promise<any>} Respuesta JSON decodificada.
 * @throws {ApiError} Cuando la respuesta no es exitosa o falla la red.
 */
async function request(path, options = {}) {
    const { method = 'GET', body, auth = true } = options;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    /** @type {Record<string, string>} */
    const headers = { Accept: 'application/json' };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    const token = getToken();
    if (auth && token) {
        headers.Authorization = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
            credentials: 'omit',
            cache: 'no-store'
        });

        const rawText = await response.text();
        let payload = null;
        if (rawText) {
            try {
                payload = JSON.parse(rawText);
            } catch {
                payload = { mensaje: rawText };
            }
        }

        if (!response.ok) {
            const mensaje = (payload && (payload.error || payload.mensaje)) ||
                `La operación no pudo completarse (código ${response.status}).`;

            if (response.status === 401 && auth) {
                clearSession();
                const enLogin = window.location.pathname.toLowerCase().endsWith('/login.html');
                if (!enLogin && !window.location.pathname.toLowerCase().endsWith('login.html')) {
                    window.setTimeout(() => {
                        window.location.replace('login.html?sesion=expirada');
                    }, 50);
                }
            }

            throw new ApiError(mensaje, response.status, payload);
        }

        return payload;
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }
        if (error && error.name === 'AbortError') {
            throw new ApiError(
                'La solicitud tardó demasiado. Verifique su conexión e intente nuevamente.',
                0
            );
        }
        throw new ApiError(
            'No se pudo conectar con el servidor. Verifique que la API esté activa e intente otra vez.',
            0
        );
    } finally {
        window.clearTimeout(timeoutId);
    }
}

/**
 * Inicia sesión con identificador (DNI, CMP o correo) y contraseña.
 * @param {{ identificador: string, password: string }} credentials Credenciales.
 * @returns {Promise<{ token: string, usuario: Record<string, any> }>} Sesión.
 */
export async function login(credentials) {
    const data = await request('/auth/login', {
        method: 'POST',
        body: {
            identificador: credentials.identificador.trim(),
            password: credentials.password
        },
        auth: false
    });
    saveSession(data.token, data.usuario);
    return data;
}

/**
 * Registra un nuevo paciente y devuelve su sesión.
 * @param {{ dni: string, nombres: string, telefono: string, email?: string, password?: string }} payload Datos.
 * @returns {Promise<{ token: string, usuario: Record<string, any> }>} Sesión creada.
 */
export async function registerPaciente(payload) {
    const data = await request('/auth/register', {
        method: 'POST',
        body: {
            dni: payload.dni.trim(),
            nombres: payload.nombres.trim(),
            telefono: payload.telefono.trim(),
            email: payload.email ? payload.email.trim() : null,
            password: payload.password ? payload.password : undefined
        },
        auth: false
    });
    saveSession(data.token, data.usuario);
    return data;
}

/**
 * Obtiene el usuario autenticado desde el token vigente.
 * @returns {Promise<{ usuario: Record<string, any> }>} Usuario del token.
 */
export function me() {
    return request('/auth/me');
}

/**
 * Lista los hospitales activos con sus especialidades.
 * @returns {Promise<Array<Record<string, any>>>} Hospitales.
 */
export function getHospitales() {
    return request('/hospitales', { auth: false });
}

/**
 * Lista médicos activos con sus bloques horarios.
 * @param {{ hospitalId?: number|string, especialidadId?: number|string }} [filters] Filtros.
 * @returns {Promise<Array<Record<string, any>>>} Médicos y horarios.
 */
export function getDoctores(filters = {}) {
    const query = buildQuery({
        hospitalId: filters.hospitalId,
        especialidadId: filters.especialidadId
    });
    return request(`/doctores${query}`, { auth: false });
}

/**
 * Lista las citas visibles para el rol autenticado.
 * @returns {Promise<Array<Record<string, any>>>} Citas.
 */
export function getCitas() {
    return request('/citas');
}

/**
 * Reserva una cita bloqueando el horario de forma atómica.
 * @param {number|string} horarioId Identificador del bloque horario.
 * @returns {Promise<{ mensaje: string, cita: Record<string, any> }>} Cita creada.
 */
export function reservarCita(horarioId) {
    return request('/citas', {
        method: 'POST',
        body: { horarioId: Number(horarioId) }
    });
}

/**
 * Reprograma una cita activa hacia un nuevo bloque horario libre.
 * @param {number|string} citaId Identificador de la cita.
 * @param {{ nuevoHorarioId: number|string, motivo?: string }} payload Datos.
 * @returns {Promise<{ mensaje: string, cita: Record<string, any> }>} Cita actualizada.
 */
export function reprogramarCita(citaId, payload) {
    return request(`/citas/${citaId}/reprogramar`, {
        method: 'PATCH',
        body: {
            nuevoHorarioId: Number(payload.nuevoHorarioId),
            motivo: payload.motivo || undefined
        }
    });
}

/**
 * Cancela una cita y libera su horario.
 * @param {number|string} citaId Identificador de la cita.
 * @param {string} [motivo] Motivo de la cancelación.
 * @returns {Promise<{ mensaje: string, cita: Record<string, any> }>} Cita actualizada.
 */
export function cancelarCita(citaId, motivo) {
    return request(`/citas/${citaId}/cancelar`, {
        method: 'PATCH',
        body: { motivo: motivo || undefined }
    });
}

/**
 * Registra el estado clínico de una cita como ATENDIDA o INASISTENCIA.
 * @param {number|string} citaId Identificador de la cita.
 * @param {'ATENDIDA'|'INASISTENCIA'} estado Estado clínico.
 * @param {string} [observacion] Observación clínica.
 * @returns {Promise<{ mensaje: string, cita: Record<string, any> }>} Cita actualizada.
 */
export function registrarAtencion(citaId, estado, observacion) {
    return request(`/citas/${citaId}/atencion`, {
        method: 'PATCH',
        body: { estado, observacion: observacion || undefined }
    });
}

/**
 * Publica un nuevo bloque horario para la agenda médica.
 * @param {{ medicoId?: number|string, fecha: string, hora: string }} payload Datos.
 * @returns {Promise<{ mensaje: string, horario: Record<string, any> }>} Horario creado.
 */
export function crearHorario(payload) {
    return request('/horarios', {
        method: 'POST',
        body: {
            medicoId: payload.medicoId ? Number(payload.medicoId) : undefined,
            fecha: payload.fecha,
            hora: payload.hora
        }
    });
}

/**
 * Obtiene los indicadores y series del dashboard administrativo.
 * @param {{ periodo?: string, especialidad?: string }} [filters] Filtros.
 * @returns {Promise<Record<string, any>>} KPIs y gráficos.
 */
export function getIndicadores(filters = {}) {
    const query = buildQuery({
        periodo: filters.periodo,
        especialidad: filters.especialidad
    });
    return request(`/dashboard/indicadores${query}`);
}

/**
 * Lista las cuentas de usuario del sistema (solo ADMIN).
 * @returns {Promise<Array<Record<string, any>>>} Usuarios.
 */
export function listarUsuarios() {
    return request('/auth/usuarios');
}

/**
 * Crea una cuenta institucional EMPLEADO o ADMIN (solo ADMIN).
 * @param {Record<string, any>} payload Datos de la cuenta.
 * @returns {Promise<{ mensaje: string, usuario: Record<string, any> }>} Cuenta creada.
 */
export function crearStaff(payload) {
    return request('/auth/staff', {
        method: 'POST',
        body: payload
    });
}

/**
 * Registra un nuevo establecimiento de salud (Lugar) con sus especialidades (solo ADMIN).
 * @param {{ nombre: string, red: string, distrito: string, direccion: string, latitud: number|string, longitud: number|string, especialidadIds?: Array<number|string> }} payload Datos.
 * @returns {Promise<{ mensaje: string, hospital: Record<string, any> }>} Lugar creado.
 */
export function crearHospital(payload) {
    return request('/hospitales', {
        method: 'POST',
        body: {
            nombre: payload.nombre,
            red: payload.red,
            distrito: payload.distrito,
            direccion: payload.direccion,
            latitud: Number(payload.latitud),
            longitud: Number(payload.longitud),
            especialidadIds: Array.isArray(payload.especialidadIds)
                ? payload.especialidadIds.map((id) => Number(id))
                : []
        }
    });
}

/**
 * Lista el catálogo activo de medicamentos (EMPLEADO / ADMIN).
 * @returns {Promise<Array<Record<string, any>>>} Medicamentos.
 */
export function getMedicamentos() {
    return request('/medicamentos');
}

/**
 * Registra un nuevo medicamento en el catálogo (solo ADMIN).
 * @param {{ codigo: string, nombre: string, presentacion: string, concentracion: string, stock: number|string }} payload Datos.
 * @returns {Promise<{ mensaje: string, medicamento: Record<string, any> }>} Medicamento creado.
 */
export function crearMedicamento(payload) {
    return request('/medicamentos', {
        method: 'POST',
        body: {
            codigo: payload.codigo,
            nombre: payload.nombre,
            presentacion: payload.presentacion,
            concentracion: payload.concentracion,
            stock: Number(payload.stock)
        }
    });
}

/**
 * Registra el diagnóstico y la receta de una cita atendida (EMPLEADO / ADMIN).
 * @param {{ citaId: number|string, codigoCie10: string, descripcion: string, indicacionesGenerales?: string, medicamentos?: Array<{ medicamentoId: number|string, dosis: string, frecuencia: string, dias: number|string }> }} payload Datos.
 * @returns {Promise<{ mensaje: string, diagnostico: Record<string, any> }>} Diagnóstico creado.
 */
export function crearDiagnostico(payload) {
    return request('/diagnosticos', {
        method: 'POST',
        body: {
            citaId: Number(payload.citaId),
            codigoCie10: payload.codigoCie10,
            descripcion: payload.descripcion,
            indicacionesGenerales: payload.indicacionesGenerales || undefined,
            medicamentos: (payload.medicamentos || []).map((item) => ({
                medicamentoId: Number(item.medicamentoId),
                dosis: item.dosis,
                frecuencia: item.frecuencia,
                dias: Number(item.dias)
            }))
        }
    });
}

/**
 * Obtiene el diagnóstico y la receta de una cita (PACIENTE / EMPLEADO / ADMIN).
 * @param {number|string} citaId Identificador de la cita.
 * @returns {Promise<Record<string, any>>} Diagnóstico con receta.
 */
export function getDiagnosticoPorCita(citaId) {
    return request(`/diagnosticos/cita/${citaId}`);
}
