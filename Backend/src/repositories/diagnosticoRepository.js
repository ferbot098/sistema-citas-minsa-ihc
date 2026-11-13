import { dataSource } from '../config/databaseConfig.js';

/**
 * @file Repositorio de diagnósticos y recetas. Ejecuta transacciones en MySQL.
 */
export class DiagnosticoRepository {
    /**
     * Registra el diagnóstico de una cita, inserta su receta y marca la cita como
     * ATENDIDA dentro de una única transacción SQL (RF-06).
     * @param {{ citaId: number, codigoCie10: string, descripcion: string, indicacionesGenerales: string, medicoNombre: string, medicamentos: Array<{ medicamentoId: number, dosis: string, frecuencia: string, dias: number }> }} data Datos del diagnóstico.
     * @returns {Promise<Object>} Diagnóstico creado con su receta.
     */
    async createDiagnosticoWithReceta(data) {
        const connection = await dataSource.getConnection();
        try {
            await connection.beginTransaction();
            const [citaRows] = await connection.query(
                'SELECT id, estado FROM citas WHERE id = ? FOR UPDATE',
                [Number(data.citaId)]
            );
            const cita = citaRows[0];
            if (!cita) {
                throw new Error('La cita indicada no existe.');
            }
            const [existentes] = await connection.query(
                'SELECT id FROM diagnosticos WHERE cita_id = ? LIMIT 1',
                [Number(data.citaId)]
            );
            if (existentes[0]) {
                throw new Error('La cita ya cuenta con un diagnóstico registrado.');
            }
            const [result] = await connection.query(
                `INSERT INTO diagnosticos (cita_id, codigo_cie10, descripcion, indicaciones_generales)
                 VALUES (?, ?, ?, ?)`,
                [Number(data.citaId), data.codigoCie10, data.descripcion, data.indicacionesGenerales || null]
            );
            const diagnosticoId = result.insertId;
            for (const medicamento of data.medicamentos) {
                await connection.query(
                    `INSERT INTO diagnostico_medicamentos (diagnostico_id, medicamento_id, dosis, frecuencia, dias)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        diagnosticoId,
                        Number(medicamento.medicamentoId),
                        medicamento.dosis,
                        medicamento.frecuencia,
                        Number(medicamento.dias)
                    ]
                );
            }
            await connection.query(
                "UPDATE citas SET estado = 'ATENDIDA', motivo_cambio = ? WHERE id = ?",
                [`Atendida por ${data.medicoNombre}`, Number(data.citaId)]
            );
            await connection.commit();
            return await this.findDiagnosticoByCitaId(data.citaId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Recupera el diagnóstico de una cita junto con su receta de medicamentos.
     * @param {number} citaId Identificador de la cita.
     * @returns {Promise<Object|null>} Diagnóstico con receta o `null`.
     */
    async findDiagnosticoByCitaId(citaId) {
        const [rows] = await dataSource.query(
            `SELECT id, cita_id, codigo_cie10, descripcion, indicaciones_generales, creado_en
             FROM diagnosticos
             WHERE cita_id = ?
             LIMIT 1`,
            [Number(citaId)]
        );
        const diagnostico = rows[0];
        if (!diagnostico) {
            return null;
        }
        const [medicamentos] = await dataSource.query(
            `SELECT dm.medicamento_id, m.codigo, m.nombre, m.presentacion, m.concentracion,
                    dm.dosis, dm.frecuencia, dm.dias
             FROM diagnostico_medicamentos dm
             INNER JOIN medicamentos m ON m.id = dm.medicamento_id
             WHERE dm.diagnostico_id = ?
             ORDER BY m.nombre ASC`,
            [diagnostico.id]
        );
        return { ...diagnostico, medicamentos };
    }
}

export const diagnosticoRepository = new DiagnosticoRepository();
