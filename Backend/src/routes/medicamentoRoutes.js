import { Router } from 'express';
import { medicamentoController } from '../controllers/medicamentoController.js';
import { requireAuth, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = Router();

// Catálogo de medicamentos para el personal asistencial y administradores
router.get('/', requireAuth, authorizeRoles('EMPLEADO', 'ADMIN'), (req, res) =>
    medicamentoController.getMedicamentos(req, res)
);
// Alta de medicamentos exclusiva del Administrador
router.post('/', requireAuth, authorizeRoles('ADMIN'), (req, res) =>
    medicamentoController.postMedicamento(req, res)
);

export default router;
