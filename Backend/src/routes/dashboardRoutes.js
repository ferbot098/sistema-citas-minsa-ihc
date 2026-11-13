import { Router } from 'express';
import { dashboardController } from '../controllers/dashboardController.js';
import { requireAuth, authorizeRoles } from '../middlewares/authMiddleware.js';
const router = Router();
// Indicadores KPI y gráficos del Dashboard (PC12)
router.get('/indicadores', requireAuth, authorizeRoles('ADMIN', 'EMPLEADO'), (req, res) =>
    dashboardController.getIndicadores(req, res)
);
export default router;
