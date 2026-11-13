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
app.use(cors());
app.use(express.json());
// Montaje modular de rutas (persistencia real en MySQL, sin modo memoria)
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
// Servicio del frontend estático bajo la misma URL pública
app.use(express.static(frontedDir));
// Verificación explícita de la conexión a MySQL antes de escuchar (sin fallback en memoria)
await checkDatabaseConnection();
app.listen(port, () => {
    console.log(`🚀 [MINSA Backend] Servidor activo en http://localhost:${port}`);
    console.log(`🌐 [MINSA Frontend] Disponible en http://localhost:${port}/`);
});
