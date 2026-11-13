import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { requireAuth, authorizeRoles } from '../middlewares/authMiddleware.js';
const router = Router();
router.post('/login', (req, res) => authController.login(req, res));
router.post('/register', (req, res) => authController.register(req, res));
router.get('/me', requireAuth, (req, res) => authController.me(req, res));
// Endpoints administrativos exclusivos para ADMIN
router.post('/staff', requireAuth, authorizeRoles('ADMIN'), (req, res) => authController.createStaff(req, res));
router.get('/usuarios', requireAuth, authorizeRoles('ADMIN'), (req, res) => authController.listUsuarios(req, res));
export default router;
