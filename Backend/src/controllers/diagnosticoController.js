import { diagnosticoService } from '../services/diagnosticoService.js';

/**
 * @file Controlador HTTP de diagnósticos y recetas.
 */
export class DiagnosticoController {
    /**
     * POST /api/diagnosticos (EMPLEADO / ADMIN)
     * @param {import('express').Request & { user: Object }} req
     * @param {import('express').Response} res
     * @returns {Promise<void>}
     */
    async postDiagnostico(req, res) {
        try {
            const diagnostico = await diagnosticoService.registrarDiagnostico(req.user, req.body || {});
            res.status(201).json({ mensaje: 'Diagnóstico y receta registrados', diagnostico });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * GET /api/diagnosticos/cita/:citaId (PACIENTE / EMPLEADO / ADMIN)
     * @param {import('express').Request & { user: Object }} req
     * @param {import('express').Response} res
     * @returns {Promise<void>}
     */
    async getByCita(req, res) {
        try {
            const diagnostico = await diagnosticoService.obtenerDiagnosticoPorCita(req.user, req.params.citaId);
            res.status(200).json(diagnostico);
        } catch (error) {
            const esNoEncontrado = /no tiene un diagnóstico|no existe/i.test(error.message);
            res.status(esNoEncontrado ? 404 : 400).json({ error: error.message });
        }
    }
}

export const diagnosticoController = new DiagnosticoController();
