import { dashboardService } from '../services/dashboardService.js';
export class DashboardController {
    async getIndicadores(req, res) {
        try {
            const data = await dashboardService.getIndicadores({
                periodo: req.query.periodo ? String(req.query.periodo) : undefined,
                especialidad: req.query.especialidad ? String(req.query.especialidad) : undefined
            });
            res.status(200).json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
export const dashboardController = new DashboardController();
