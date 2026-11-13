import { dataSource } from '../config/databaseConfig.js';

/**
 * @file Repositorio de analítica del dashboard. Consulta MySQL directamente.
 */
export class DashboardRepository {
    /**
     * Recupera todas las citas filtradas por periodo (YYYY-MM) y especialidad para calcular los KPIs de PC12.
     * @param {{ periodo?: string, especialidad?: string }} filters Filtros.
     * @returns {Promise<Array<Object>>} Citas para analítica.
     */
    async getCitasForAnalytics(filters = {}) {
        let sql = `
            SELECT id, codigo_atencion, hospital_nombre, especialidad_nombre, medico_nombre,
                   DATE_FORMAT(fecha_cita, '%Y-%m-%d') AS fecha_cita, hora_cita, estado
            FROM citas
            WHERE 1=1
        `;
        const params = [];
        if (filters.periodo && filters.periodo !== 'todos') {
            sql += " AND DATE_FORMAT(fecha_cita, '%Y-%m') = ?";
            params.push(filters.periodo);
        }
        if (filters.especialidad && filters.especialidad !== 'todas') {
            sql += ' AND LOWER(especialidad_nombre) = LOWER(?)';
            params.push(filters.especialidad);
        }
        const [rows] = await dataSource.query(sql, params);
        return rows;
    }
}

export const dashboardRepository = new DashboardRepository();
