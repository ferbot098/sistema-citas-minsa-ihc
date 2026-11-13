import crypto from 'crypto';
import { citaRepository } from '../repositories/citaRepository.js';
const ETIQUETAS_ESTADO = Object.freeze({
    RESERVADA: 'Su cita fue confirmada',
    REPROGRAMADA: 'Su cita fue reprogramada',
    CANCELADA: 'Cita cancelada',
    ATENDIDA: 'Atención médica completada',
    INASISTENCIA: 'Paciente no se presentó'
});
export class CitaService {
    /**
     * Enriquece una cita con su etiqueta textual accesible (RNF-ACC-04).
     * @param {Object} cita
     * @returns {Object}
     */
    decorateCita(cita) {
        return {
            ...cita,
            etiquetaEstado: ETIQUETAS_ESTADO[cita.estado] || cita.estado
        };
    }
    /**
     * Catálogo de establecimientos activos y sus especialidades (RN-01, RN-02).
     * @returns {Promise<Array<Object>>}
     */
    async getHospitales() {
        return await citaRepository.findHospitalesConEspecialidades();
    }
    /**
     * Registra un nuevo establecimiento de salud (Lugar) y asocia sus especialidades (Solo ADMIN).
     * @param {{ nombre: string, red: string, distrito: string, direccion: string, latitud: number|string, longitud: number|string, especialidadIds?: number[] }} payload Datos del lugar.
     * @returns {Promise<Object>} Hospital creado.
     */
    async registrarHospital(payload) {
        const nombre = String(payload.nombre || '').trim();
        const red = String(payload.red || '').trim();
        const distrito = String(payload.distrito || '').trim();
        const direccion = String(payload.direccion || '').trim();
        const latitud = Number(payload.latitud);
        const longitud = Number(payload.longitud);
        if (nombre.length < 3 || !red || !distrito || !direccion) {
            throw new Error('Complete nombre, red, distrito y dirección del establecimiento.');
        }
        if (Number.isNaN(latitud) || Number.isNaN(longitud)) {
            throw new Error('Ingrese coordenadas válidas (latitud y longitud) del establecimiento.');
        }
        const especialidadIds = Array.isArray(payload.especialidadIds)
            ? [...new Set(payload.especialidadIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
            : [];
        if (especialidadIds.length > 0) {
            const existentes = await citaRepository.findEspecialidadesByIds(especialidadIds);
            if (existentes.length !== especialidadIds.length) {
                throw new Error('Una o más especialidades seleccionadas no existen en el catálogo.');
            }
        }
        return await citaRepository.createHospitalWithEspecialidades({
            nombre,
            red,
            distrito,
            direccion,
            latitud,
            longitud,
            especialidadIds
        });
    }
    /**
     * Catálogo de médicos y bloques horarios (RN-03, RF-03, RF-04).
     * @param {{ hospitalId?: number, especialidadId?: number }} filters
     * @returns {Promise<Array<Object>>}
     */
    async getMedicosYHorarios(filters) {
        return await citaRepository.findMedicosYHorarios(filters);
    }
    /**
     * Registra una cita médica validando reglas RN-04, RN-05, RN-06 y RF-10.
     * @param {import('../middlewares/authMiddleware.js').JwtUserPayload} user
     * @param {{ horarioId: number }} body
     * @returns {Promise<Object>}
     */
    async reservarCita(user, body) {
        if (!body || !body.horarioId) {
            throw new Error('Debe seleccionar un bloque horario válido antes de confirmar (RN-06).');
        }
        const randomNum = crypto.randomInt(1000, 9999);
        const codigoAtencion = `M-${randomNum}`;
        const cita = await citaRepository.createCitaAtomic({
            pacienteId: user.id,
            dni: user.dni,
            pacienteNombre: user.nombres,
            horarioId: Number(body.horarioId),
            codigoAtencion
        });
        return this.decorateCita(cita);
    }
    /**
     * Lista citas aplicando estricto aislamiento por rol (RN-12, RNF-SEG-01).
     * @param {import('../middlewares/authMiddleware.js').JwtUserPayload} user
     * @returns {Promise<Array<Object>>}
     */
    async listarCitasPorRol(user) {
        let citas = [];
        if (user.rol === 'PACIENTE') {
            citas = await citaRepository.findCitasByScope({ pacienteId: user.id });
        } else if (user.rol === 'EMPLEADO') {
            citas = user.medicoId
                ? await citaRepository.findCitasByScope({ medicoId: user.medicoId })
                : await citaRepository.findCitasByScope({});
        } else if (user.rol === 'ADMIN') {
            citas = await citaRepository.findCitasByScope({});
        }
        return citas.map(c => this.decorateCita(c));
    }
    /**
     * Reprograma una cita activa validando pertenencia y disponibilidad (RN-07, RN-12, RF-07).
     * @param {import('../middlewares/authMiddleware.js').JwtUserPayload} user
     * @param {number} citaId
     * @param {{ nuevoHorarioId: number, motivo?: string }} payload
     * @returns {Promise<Object>}
     */
    async reprogramarCita(user, citaId, payload) {
        if (!payload || !payload.nuevoHorarioId) {
            throw new Error('Debe indicar el nuevo bloque horario para reprogramar.');
        }
        const cita = await citaRepository.findCitaById(citaId);
        if (!cita) {
            throw new Error('La cita solicitada no existe.');
        }
        if (user.rol === 'PACIENTE' && cita.paciente_id !== user.id) {
            throw new Error('Acceso denegado: solo puede reprogramar sus propias citas (RN-12).');
        }
        if (!['RESERVADA', 'REPROGRAMADA'].includes(cita.estado)) {
            throw new Error(`No se puede reprogramar una cita en estado ${cita.estado} (RN-07).`);
        }
        const updated = await citaRepository.reprogramarCitaAtomic(
            citaId,
            Number(payload.nuevoHorarioId),
            payload.motivo || 'Reprogramación solicitada por el usuario'
        );
        return this.decorateCita(updated);
    }
    /**
     * Cancela una cita activa liberando el horario (RN-08, RN-09, RN-12, RF-08).
     * @param {import('../middlewares/authMiddleware.js').JwtUserPayload} user
     * @param {number} citaId
     * @param {string} [motivo]
     * @returns {Promise<Object>}
     */
    async cancelarCita(user, citaId, motivo) {
        const cita = await citaRepository.findCitaById(citaId);
        if (!cita) {
            throw new Error('La cita solicitada no existe.');
        }
        if (user.rol === 'PACIENTE' && cita.paciente_id !== user.id) {
            throw new Error('Acceso denegado: solo puede cancelar sus propias citas (RN-12).');
        }
        if (user.rol === 'EMPLEADO' && user.medicoId && cita.medico_id !== user.medicoId) {
            throw new Error('Solo puede gestionar citas asignadas a su agenda médica.');
        }
        if (!['RESERVADA', 'REPROGRAMADA'].includes(cita.estado)) {
            throw new Error(`No es posible cancelar una cita que ya está en estado ${cita.estado}.`);
        }
        const updated = await citaRepository.updateEstadoCitaAtomic(
            citaId,
            'CANCELADA',
            motivo || `Cancelada por ${user.rol}`
        );
        return this.decorateCita(updated);
    }
    /**
     * Permite a EMPLEADO o ADMIN marcar una cita como ATENDIDA o INASISTENCIA.
     * @param {import('../middlewares/authMiddleware.js').JwtUserPayload} user
     * @param {number} citaId
     * @param {'ATENDIDA'|'INASISTENCIA'} estadoClinico
     * @param {string} [observacion]
     * @returns {Promise<Object>}
     */
    async registrarAtencionClinica(user, citaId, estadoClinico, observacion) {
        if (!['ATENDIDA', 'INASISTENCIA'].includes(estadoClinico)) {
            throw new Error('Estado clínico inválido. Use ATENDIDA o INASISTENCIA.');
        }
        const cita = await citaRepository.findCitaById(citaId);
        if (!cita) {
            throw new Error('La cita solicitada no existe.');
        }
        if (user.rol === 'EMPLEADO' && user.medicoId && cita.medico_id !== user.medicoId) {
            throw new Error('Acceso denegado: esta cita pertenece a otro profesional médico.');
        }
        if (!['RESERVADA', 'REPROGRAMADA'].includes(cita.estado)) {
            throw new Error(`Solo se pueden atender citas activas. Estado actual: ${cita.estado}.`);
        }
        const updated = await citaRepository.updateEstadoCitaAtomic(
            citaId,
            estadoClinico,
            observacion || `Registrado por ${user.nombres}`
        );
        return this.decorateCita(updated);
    }
    /**
     * Crea un nuevo turno disponible en la agenda médica (EMPLEADO / ADMIN).
     * @param {import('../middlewares/authMiddleware.js').JwtUserPayload} user
     * @param {{ medicoId?: number, fecha: string, hora: string }} payload
     * @returns {Promise<Object>}
     */
    async publicarHorario(user, payload) {
        const medicoId = user.rol === 'EMPLEADO' && user.medicoId ? user.medicoId : Number(payload.medicoId);
        if (!medicoId || !payload.fecha || !payload.hora) {
            throw new Error('Debe especificar médico, fecha (YYYY-MM-DD) y hora (ej. 08:30 AM).');
        }
        return await citaRepository.createHorario({
            medicoId,
            fecha: payload.fecha,
            hora: payload.hora.trim()
        });
    }
}
export const citaService = new CitaService();
