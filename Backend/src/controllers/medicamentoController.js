import { medicamentoService } from '../services/medicamentoService.js';

/**
 * @file Controlador HTTP del catálogo de medicamentos.
 */
export class MedicamentoController {
    /**
     * GET /api/medicamentos
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @returns {Promise<void>}
     */
    async getMedicamentos(req, res) {
        try {
            const data = await medicamentoService.listarMedicamentos();
            res.status(200).json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /api/medicamentos (Solo ADMIN)
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @returns {Promise<void>}
     */
    async postMedicamento(req, res) {
        try {
            const medicamento = await medicamentoService.registrarMedicamento(req.body || {});
            res.status(201).json({ mensaje: 'Medicamento registrado', medicamento });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

export const medicamentoController = new MedicamentoController();
