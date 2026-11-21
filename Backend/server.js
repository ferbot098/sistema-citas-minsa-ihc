import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { applicationProperties } from './src/config/applicationProperties.js';
import { checkDatabaseConnection } from './src/config/databaseConfig.js';
import authRoutes from './src/routes/authRoutes.js';
import citaRoutes from './src/routes/citaRoutes.js';
import dashboardRoutes from './src/routes/dashboardRoutes.js';
import medicamentoRoutes from './src/routes/medicamentoRoutes.js';
import diagnosticoRoutes from './src/routes/diagnosticoRoutes.js';

/**
 * @typedef {import('express').Express} ExpressApp
 * @typedef {import('express').Request} ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 * @typedef {import('express').NextFunction} ExpressNextFunction
 * @typedef {import('cors').CorsOptions} CorsOptions
 */

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontedDir = path.join(currentDir, '..', 'Fronted');

/**
 * Normaliza una URL de origen eliminando espacios y barras finales.
 *
 * @param {string | undefined} rawUrl - URL sin normalizar.
 * @returns {string} URL normalizada sin barra final.
 */
function normalizeOrigin(rawUrl) {
    return String(rawUrl || '').trim().replace(/\/+$/, '');
}

/**
 * Construye el conjunto de orígenes permitidos combinando entornos conocidos
 * y variables de entorno de despliegue (Render / configuración personalizada).
 *
 * @returns {Set<string>} Conjunto de orígenes HTTP/HTTPS autorizados.
 */
function buildAllowedOrigins() {
    /** @type {string[]} */
    const baseOrigins = [
        'https://sistema-citas-minsa-ihc.onrender.com',
        'https://minsa-sistema-cita.onrender.com',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ];

    /** @type {string[]} */
    const envOrigins = String(process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(normalizeOrigin)
        .filter(Boolean);

    if (process.env.RENDER_EXTERNAL_URL) {
        envOrigins.push(normalizeOrigin(process.env.RENDER_EXTERNAL_URL));
    }

    return new Set([...baseOrigins.map(normalizeOrigin), ...envOrigins]);
}

/**
 * Genera la configuración del middleware CORS validando orígenes explícitos
 * y subdominios HTTPS válidos de Render.
 *
 * @param {Set<string>} allowedOrigins - Conjunto de orígenes permitidos.
 * @returns {CorsOptions} Opciones para el middleware `cors`.
 */
function createCorsOptions(allowedOrigins) {
    return {
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }

            const cleanOrigin = normalizeOrigin(origin);
            const isRenderDomain = /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(cleanOrigin);

            if (allowedOrigins.has(cleanOrigin) || isRenderDomain) {
                callback(null, true);
                return;
            }

            callback(new Error(`CORS: Origen no permitido — ${cleanOrigin}`));
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false
    };
}

/**
 * Middleware que inyecta cabeceras de seguridad HTTP y política CSP
 * compatible con los CDNs de Bootstrap, Leaflet, Google Fonts y ambos dominios Render.
 *
 * @param {ExpressRequest} _req - Objeto de solicitud HTTP.
 * @param {ExpressResponse} res - Objeto de respuesta HTTP.
 * @param {ExpressNextFunction} next - Siguiente middleware.
 * @returns {void}
 */
function securityHeadersMiddleware(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com 'unsafe-inline'",
            "style-src 'self' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com 'unsafe-inline'",
            "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net data:",
            "img-src 'self' data: https://*.tile.openstreetmap.org https://unpkg.com https://*.google.com https://*.gstatic.com",
            "frame-src 'self' https://www.google.com https://maps.google.com",
            "connect-src 'self' https://sistema-citas-minsa-ihc.onrender.com https://minsa-sistema-cita.onrender.com http://localhost:* http://127.0.0.1:*",
            "frame-ancestors 'none'"
        ].join('; ')
    );
    next();
}

/**
 * Registra todos los módulos de rutas de la API REST y el endpoint de estado `/api`.
 *
 * @param {ExpressApp} app - Instancia de Express.
 * @returns {void}
 */
function registerApiRoutes(app) {
    app.use('/api/auth', authRoutes);
    app.use('/api/medicamentos', medicamentoRoutes);
    app.use('/api/diagnosticos', diagnosticoRoutes);
    app.use('/api', citaRoutes);
    app.use('/api/dashboard', dashboardRoutes);

    app.get('/api', (_req, res) => {
        res.json({
            aplicacion: 'Sistema Inclusivo de Citas Médicas - MINSA',
            estado: 'UP',
            persistencia: 'MySQL (TiDB Cloud / local)',
            rolesSoportados: ['PACIENTE', 'EMPLEADO', 'ADMIN'],
            endpoints: {
                auth: [
                    'POST /api/auth/login',
                    'POST /api/auth/register',
                    'GET /api/auth/me',
                    'GET /api/auth/usuarios',
                    'POST /api/auth/staff'
                ],
                lugares: ['GET /api/hospitales', 'POST /api/hospitales (ADMIN)'],
                citas: [
                    'GET /api/doctores',
                    'GET /api/citas',
                    'POST /api/citas',
                    'PATCH /api/citas/:id/reprogramar',
                    'PATCH /api/citas/:id/cancelar',
                    'PATCH /api/citas/:id/atencion',
                    'POST /api/horarios'
                ],
                medicamentos: ['GET /api/medicamentos', 'POST /api/medicamentos (ADMIN)'],
                diagnosticos: ['POST /api/diagnosticos (EMPLEADO)', 'GET /api/diagnosticos/cita/:citaId'],
                dashboard: ['GET /api/dashboard/indicadores?periodo=2026-10&especialidad=Cardiología']
            }
        });
    });
}

/**
 * Middleware centralizado para capturar errores de CORS o JSON malformado
 * devolviendo respuestas JSON estructuradas.
 *
 * @param {Error & { status?: number }} err - Error capturado en la cadena de middlewares.
 * @param {ExpressRequest} _req - Solicitud HTTP.
 * @param {ExpressResponse} res - Respuesta HTTP.
 * @param {ExpressNextFunction} next - Siguiente middleware.
 * @returns {void}
 */
function errorHandlerMiddleware(err, _req, res, next) {
    if (res.headersSent) {
        next(err);
        return;
    }

    if (err && typeof err.message === 'string' && err.message.startsWith('CORS:')) {
        res.status(403).json({
            error: 'Origen no autorizado por política CORS',
            detalle: err.message
        });
        return;
    }

    const statusCode = Number.isInteger(err?.status) ? err.status : 500;
    console.error('[MINSA Backend] Error no controlado:', err);
    res.status(statusCode).json({
        error: 'Error interno del servidor'
    });
}

/**
 * Construye y configura la instancia principal de Express separando middlewares,
 * rutas de API, archivos estáticos del frontend y manejo de errores.
 *
 * @returns {ExpressApp} Aplicación Express configurada.
 */
function createApp() {
    const app = express();
    const allowedOrigins = buildAllowedOrigins();

    app.use(cors(createCorsOptions(allowedOrigins)));
    app.use(securityHeadersMiddleware);
    app.use(express.json());

    registerApiRoutes(app);

    app.use(express.static(frontedDir));
    app.get('*', (_req, res) => {
        res.sendFile(path.join(frontedDir, 'index.html'));
    });

    app.use(errorHandlerMiddleware);
    return app;
}

/**
 * Inicializa la verificación de base de datos y levanta el servidor HTTP.
 *
 * @returns {Promise<void>} Promesa resuelta cuando el servidor queda escuchando.
 */
async function startServer() {
    const port = applicationProperties.server.port;
    const app = createApp();

    try {
        await checkDatabaseConnection();
        app.listen(port, () => {
            console.log(`🚀 [MINSA Backend] Servidor activo en http://localhost:${port}`);
            console.log(`🌐 [MINSA Frontend] Disponible en http://localhost:${port}/`);
        });
    } catch (error) {
        console.error('[MINSA Backend] Fallo crítico al iniciar el servidor:', error);
        process.exit(1);
    }
}

await startServer();
