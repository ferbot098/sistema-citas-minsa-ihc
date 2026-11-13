import { diagnosticoRepository } from '../repositories/diagnosticoRepository.js';
import { citaRepository } from '../repositories/citaRepository.js';
import { medicamentoRepository } from '../repositories/medicamentoRepository.js';

/**
 * @file Servicio de diagnósticos y recetas (capa de negocio).
 */
export class DiagnosticoService {
    /**
     * Registra el diagnóstico y la receta de una cita atendida (EMPLEADO / ADMIN).
     * @param {import('../middlewares/authMiddleware.js').JwtUserPayload} user Usuario autenticado.
     * @param {Object} payload Datos del diagnóstico.
     * @param {number|string} payload.citaId Identificador de la cita.
     * @param {string} payload.codigoCie10 Código CIE-10.
     * @param {string} payload.descripcion Diagnóstico clínico.
     * @param {string} [payload.indicacionesGenerales] Indicaciones generales.
     * @param {Array<{ medicamentoId: number|string, dosis: string, frecuencia: string, dias: number|string }>} [payload.medicamentos] Receta.
     * @returns {Promise<Object>} Diagnóstico creado con su receta.
     */
    async registrarDiagnostico(user, payload) {
        const citaId = Number(payload && payload.citaId);
        const codigoCie10 = String((payload && payload.codigoCie10) || '').trim();
        const descripcion = String((payload && payload.descripcion) || '').trim();
        const indicacionesGenerales = String((payload && payload.indicacionesGenerales) || '').trim();

        if (!Number.isInteger(citaId) || citaId <= 0) {
            throw new Error('Debe indicar la cita a la que corresponde el diagnóstico.');
        }
        if (codigoCie10.length < 2) {
            throw new Error('Ingrese el código CIE-10 del diagnóstico.');
        }
        if (descripcion.length < 5) {
            throw new Error('Ingrese el diagnóstico clínico (mínimo 5 caracteres).');
        }

        const cita = await citaRepository.findCitaById(citaId);
        if (!cita) {
            throw new Error('La cita indicada no existe.');
        }
        if (user.rol === 'EMPLEADO' && user.medicoId && cita.medico_id !== user.medicoId) {
            throw new Error('Acceso denegado: esta cita pertenece a otro profesional médico.');
        }
        if (!['RESERVADA', 'REPROGRAMADA'].includes(cita.estado)) {
            throw new Error(`Solo se puede diagnosticar citas activas. Estado actual: ${cita.estado}.`);
        }

        const medicamentosEntrada = Array.isArray(payload.medicamentos) ? payload.medicamentos : [];
        /** @type {Array<{ medicamentoId: number, dosis: string, frecuencia: string, dias: number }>} */
        const medicamentos = [];
        for (const item of medicamentosEntrada) {
            const medicamentoId = Number(item && item.medicamentoId);
            const dosis = String((item && item.dosis) || '').trim();
            const frecuencia = String((item && item.frecuencia) || '').trim();
            const dias = Number(item && item.dias);
            if (!Number.isInteger(medicamentoId) || medicamentoId <= 0) {
                continue;
            }
            if (!dosis || !frecuencia) {
                throw new Error('Cada medicamento recetado requiere dosis y frecuencia.');
            }
            if (!Number.isInteger(dias) || dias <= 0) {
                throw new Error('Los días de tratamiento deben ser un número entero mayor que cero.');
            }
            medicamentos.push({ medicamentoId, dosis, frecuencia, dias });
        }

        if (medicamentos.length > 0) {
            const ids = medicamentos.map((m) => m.medicamentoId);
            const existentes = await medicamentoRepository.findActiveByIds(ids);
            const idsValidos = new Set(existentes.map((m) => m.id));
            const invalido = ids.find((id) => !idsValidos.has(id));
            if (invalido) {
                throw new Error(`El medicamento con identificador ${invalido} no existe o está inactivo.`);
            }
        }

        return await diagnosticoRepository.createDiagnosticoWithReceta({
            citaId,
            codigoCie10,
            descripcion,
            indicacionesGenerales,
            medicoNombre: user.nombres,
            medicamentos
        });
    }

    /**
     * Recupera el diagnóstico y la receta de una cita aplicando control de acceso por rol.
     * @param {import('../middlewares/authMiddleware.js').JwtUserPayload} user Usuario autenticado.
     * @param {number|string} citaId Identificador de la cita.
     * @returns {Promise<Object>} Diagnóstico con receta.
     */
    async obtenerDiagnosticoPorCita(user, citaId) {
        const id = Number(citaId);
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error('Identificador de cita inválido.');
        }
        const cita = await citaRepository.findCitaById(id);
        if (!cita) {
            throw new Error('La cita indicada no existe.');
        }
        if (user.rol === 'PACIENTE' && cita.paciente_id !== user.id) {
            throw new Error('Acceso denegado: solo puede consultar el diagnóstico de sus propias citas.');
        }
        if (user.rol === 'EMPLEADO' && user.medicoId && cita.medico_id !== user.medicoId) {
            throw new Error('Acceso denegado: esta cita pertenece a otro profesional médico.');
        }
        const diagnostico = await diagnosticoRepository.findDiagnosticoByCitaId(id);
        if (!diagnostico) {
            throw new Error('La cita aún no tiene un diagnóstico registrado.');
        }
        return { cita: { codigo_atencion: cita.codigo_atencion, fecha_cita: cita.fecha_cita }, ...diagnostico };
    }
}

export const diagnosticoService = new DiagnosticoService();
