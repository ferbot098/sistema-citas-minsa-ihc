import { authService } from '../services/authService.js';
export class AuthController {
    /**
     * POST /api/auth/login
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async login(req, res) {
        try {
            const result = await authService.login(req.body);
            res.status(200).json({ mensaje: 'Inicio de sesión exitoso', ...result });
        } catch (error) {
            res.status(401).json({ error: error.message });
        }
    }
    /**
     * POST /api/auth/register
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async register(req, res) {
        try {
            const result = await authService.registerPaciente(req.body);
            res.status(201).json({ mensaje: 'Paciente registrado exitosamente', ...result });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
    /**
     * GET /api/auth/me
     * @param {import('express').Request & { user?: Object }} req
     * @param {import('express').Response} res
     */
    me(req, res) {
        res.status(200).json({ usuario: req.user });
    }
    /**
     * POST /api/auth/staff (Solo ADMIN)
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async createStaff(req, res) {
        try {
            const created = await authService.createStaffAccount(req.body);
            res.status(201).json({ mensaje: 'Cuenta institucional creada', usuario: created });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
    /**
     * GET /api/auth/usuarios (Solo ADMIN)
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async listUsuarios(req, res) {
        try {
            const usuarios = await authService.listUsuarios();
            res.status(200).json(usuarios);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
export const authController = new AuthController();
