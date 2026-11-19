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

const app = express();
const port = applicationProperties.server.port;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontedDir = path.join(currentDir, '..', 'Fronted');

// ── Orígenes permitidos (producción + desarrollo local) ──────────────────────
const ALLOWED_ORIGINS = [
    'https://minsa-sistema-cita.onrender.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

app.use(cors({
    origin: (origin, callback) => {
        // Permitir peticiones sin origin (ej. curl, Postman, mismo servidor)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: Origen no permitido — ${origin}`));
        }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

// ── Cabeceras de seguridad HTTP básicas ──────────────────────────────────────
app.use((_req, res, next) => {
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
            "connect-src 'self' https://minsa-sistema-cita.onrender.com http://localhost:*",
            "frame-ancestors 'none'"
        ].join('; ')
    );
    next();
});

app.use(express.json());

// ── Montaje modular de rutas (persistencia real en MySQL) ────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/medicamentos', medicamentoRoutes);
app.use('/api/diagnosticos', diagnosticoRoutes);
app.use('/api', citaRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api', (req, res) => {
    res.json({
        aplicacion: 'Sistema Inclusivo de Citas Médicas - MINSA',
        estado: 'UP',
        persistencia: 'MySQL (TiDB Cloud / local)',
        rolesSoportados: ['PACIENTE', 'EMPLEADO', 'ADMIN'],
        endpoints: {
            auth: ['POST /api/auth/login', 'POST /api/auth/register', 'GET /api/auth/me', 'GET /api/auth/usuarios', 'POST /api/auth/staff'],
            lugares: ['GET /api/hospitales', 'POST /api/hospitales (ADMIN)'],
            citas: ['GET /api/doctores', 'GET /api/citas', 'POST /api/citas', 'PATCH /api/citas/:id/reprogramar', 'PATCH /api/citas/:id/cancelar', 'PATCH /api/citas/:id/atencion', 'POST /api/horarios'],
            medicamentos: ['GET /api/medicamentos', 'POST /api/medicamentos (ADMIN)'],
            diagnosticos: ['POST /api/diagnosticos (EMPLEADO)', 'GET /api/diagnosticos/cita/:citaId'],
            dashboard: ['GET /api/dashboard/indicadores?periodo=2026-10&especialidad=Cardiología']
        }
    });
});

// ── Servicio del frontend estático bajo la misma URL pública ─────────────────
app.use(express.static(frontedDir));

// ── Catch-all: devuelve index.html para rutas del SPA ───────────────────────
app.get('*', (_req, res) => {
    res.sendFile(path.join(frontedDir, 'index.html'));
});

// ── Verificación de conexión MySQL antes de escuchar ────────────────────────
await checkDatabaseConnection();
app.listen(port, () => {
    console.log(`🚀 [MINSA Backend] Servidor activo en http://localhost:${port}`);
    console.log(`🌐 [MINSA Frontend] Disponible en http://localhost:${port}/`);
});
