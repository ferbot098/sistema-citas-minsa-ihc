import { dashboardRepository } from '../repositories/dashboardRepository.js';
export class DashboardService {
    /**
     * Calcula los 4 KPIs y los 3 conjuntos de datos gráficos exigidos en la PC12 (Grupo 3 - MINSA).
     * @param {{ periodo?: string, especialidad?: string }} filters
     * @returns {Promise<Object>}
     */
    async getIndicadores(filters = {}) {
        const citas = await dashboardRepository.getCitasForAnalytics(filters);
        const totalProgramadas = citas.length;
        const totalAtendidas = citas.filter(c => c.estado === 'ATENDIDA').length;
        const totalCanceladas = citas.filter(c => c.estado === 'CANCELADA').length;
        const totalInasistencias = citas.filter(c => c.estado === 'INASISTENCIA').length;
        const totalActivas = citas.filter(c => ['RESERVADA', 'REPROGRAMADA'].includes(c.estado)).length;
        const porcentajeInasistencia =
            totalProgramadas > 0 ? Number(((totalInasistencias / totalProgramadas) * 100).toFixed(1)) : 0;
        // Gráfico 1: Citas por especialidad
        /** @type {Record<string, number>} */
        const porEspecialidadMap = {};
        for (const c of citas) {
            porEspecialidadMap[c.especialidad_nombre] = (porEspecialidadMap[c.especialidad_nombre] || 0) + 1;
        }
        // Gráfico 2: Evolución mensual (YYYY-MM)
        /** @type {Record<string, { atendidas: number, programadas: number }>} */
        const evolucionMap = {};
        for (const c of citas) {
            const mes = c.fecha_cita.slice(0, 7);
            if (!evolucionMap[mes]) {
                evolucionMap[mes] = { atendidas: 0, programadas: 0 };
            }
            evolucionMap[mes].programadas += 1;
            if (c.estado === 'ATENDIDA') {
                evolucionMap[mes].atendidas += 1;
            }
        }
        const mesesOrdenados = Object.keys(evolucionMap).sort();
        // Gráfico 3: Distribución por estado
        const distribucionEstados = {
            RESERVADA: citas.filter(c => c.estado === 'RESERVADA').length,
            REPROGRAMADA: citas.filter(c => c.estado === 'REPROGRAMADA').length,
            ATENDIDA: totalAtendidas,
            CANCELADA: totalCanceladas,
            INASISTENCIA: totalInasistencias
        };
        return {
            filtrosAplicados: {
                periodo: filters.periodo || 'todos',
                especialidad: filters.especialidad || 'todas'
            },
            kpis: {
                citasProgramadas: totalProgramadas,
                citasAtendidas: totalAtendidas,
                citasCanceladas: totalCanceladas,
                citasActivas: totalActivas,
                inasistencias: totalInasistencias,
                porcentajeInasistencia
            },
            graficos: {
                citasPorEspecialidad: {
                    labels: Object.keys(porEspecialidadMap),
                    values: Object.values(porEspecialidadMap)
                },
                evolucionMensual: {
                    labels: mesesOrdenados,
                    programadas: mesesOrdenados.map(m => evolucionMap[m].programadas),
                    atendidas: mesesOrdenados.map(m => evolucionMap[m].atendidas)
                },
                distribucionPorEstado: {
                    labels: ['Reservadas', 'Reprogramadas', 'Atendidas', 'Canceladas', 'Inasistencias'],
                    values: [
                        distribucionEstados.RESERVADA,
                        distribucionEstados.REPROGRAMADA,
                        distribucionEstados.ATENDIDA,
                        distribucionEstados.CANCELADA,
                        distribucionEstados.INASISTENCIA
                    ]
                }
            }
        };
    }
}
export const dashboardService = new DashboardService();
