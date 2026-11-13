import crypto from 'crypto';
import { applicationProperties } from '../config/applicationProperties.js';
/**
 * @typedef {Object} JwtUserPayload
 * @property {number} id
 * @property {string} dni
 * @property {string} nombres
 * @property {'PACIENTE'|'EMPLEADO'|'ADMIN'} rol
 * @property {number|null} medicoId
 * @property {number} exp
 */
/**
 * Firma y genera un token JWT HMAC-SHA256 sin dependencias externas.
 * @param {Omit<JwtUserPayload, 'exp'>} payload
 * @returns {string}
 */
export function signJwtToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + applicationProperties.security.jwtExpiresHours * 3600;
    const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
    const signature = crypto
        .createHmac('sha256', applicationProperties.security.jwtSecret)
        .update(`${header}.${body}`)
        .digest('base64url');
    return `${header}.${body}.${signature}`;
}
/**
 * Verifica la validez y expiración de un token JWT.
 * @param {string} token
 * @returns {JwtUserPayload}
 */
export function verifyJwtToken(token) {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Formato de token inválido.');
    }
    const [header, body, signature] = parts;
    const expectedSignature = crypto
        .createHmac('sha256', applicationProperties.security.jwtSecret)
        .update(`${header}.${body}`)
        .digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        throw new Error('Firma de token inválida.');
    }
    /** @type {JwtUserPayload} */
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('La sesión ha expirado. Inicie sesión nuevamente.');
    }
    return decoded;
}
/**
 * Middleware Express que exige autenticación Bearer JWT.
 * @param {import('express').Request & { user?: JwtUserPayload }} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Acceso denegado. Debe iniciar sesión para continuar.' });
        return;
    }
    try {
        const token = authHeader.slice(7).trim();
        req.user = verifyJwtToken(token);
        next();
    } catch (error) {
        res.status(401).json({ error: error.message || 'Token de sesión no válido.' });
    }
}
/**
 * Middleware de control de acceso basado en roles (RBAC).
 * @param {...('PACIENTE'|'EMPLEADO'|'ADMIN')} allowedRoles
 * @returns {(req: import('express').Request & { user?: JwtUserPayload }, res: import('express').Response, next: import('express').NextFunction) => void}
 */
export function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Usuario no autenticado.' });
            return;
        }
        if (!allowedRoles.includes(req.user.rol)) {
            res.status(403).json({
                error: `Acceso restringido. Su rol (${req.user.rol}) no tiene permisos para esta operación.`
            });
            return;
        }
        next();
    };
}
