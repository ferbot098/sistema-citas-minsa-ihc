import { Router } from 'express';
import { diagnosticoController } from '../controllers/diagnosticoController.js';
import { requireAuth, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = Router();

// Registro del diagnóstico y receta al atender una cita (Personal asistencial / Admin)
router.post('/', requireAuth, authorizeRoles('EMPLEADO', 'ADMIN'), (req, res) =>
    diagnosticoController.postDiagnostico(req, res)
);
// Consulta del diagnóstico y receta de una cita (los tres roles con control de pertenencia)
router.get('/cita/:citaId', requireAuth, authorizeRoles('PACIENTE', 'EMPLEADO', 'ADMIN'), (req, res) =>
    diagnosticoController.getByCita(req, res)
);

export default router;
