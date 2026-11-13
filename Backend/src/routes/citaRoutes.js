import { Router } from 'express';
import { citaController } from '../controllers/citaController.js';
import { requireAuth, authorizeRoles } from '../middlewares/authMiddleware.js';
const router = Router();
// Catálogos públicos de oferta médica (RN-01, RN-02, RN-03)
router.get('/hospitales', (req, res) => citaController.getHospitales(req, res));
router.get('/doctores', (req, res) => citaController.getMedicos(req, res));
// Gestión de Lugares/Hospitales (Solo ADMIN)
router.post('/hospitales', requireAuth, authorizeRoles('ADMIN'), (req, res) =>
    citaController.postHospital(req, res)
);
// Gestión de citas con control de roles (RBAC)
router.get('/citas', requireAuth, authorizeRoles('PACIENTE', 'EMPLEADO', 'ADMIN'), (req, res) =>
    citaController.getCitas(req, res)
);
router.post('/citas', requireAuth, authorizeRoles('PACIENTE'), (req, res) =>
    citaController.postCita(req, res)
);
router.patch('/citas/:id/reprogramar', requireAuth, authorizeRoles('PACIENTE', 'ADMIN'), (req, res) =>
    citaController.patchReprogramar(req, res)
);
router.patch('/citas/:id/cancelar', requireAuth, authorizeRoles('PACIENTE', 'EMPLEADO', 'ADMIN'), (req, res) =>
    citaController.patchCancelar(req, res)
);
// Acciones exclusivas de Personal Asistencial (EMPLEADO) y Administrador (ADMIN)
router.patch('/citas/:id/atencion', requireAuth, authorizeRoles('EMPLEADO', 'ADMIN'), (req, res) =>
    citaController.patchAtender(req, res)
);
router.post('/horarios', requireAuth, authorizeRoles('EMPLEADO', 'ADMIN'), (req, res) =>
    citaController.postHorario(req, res)
);
export default router;
