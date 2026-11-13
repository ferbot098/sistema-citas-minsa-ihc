import { dataSource } from '../config/databaseConfig.js';

/**
 * @typedef {Object} MedicamentoRecord
 * @property {number} id
 * @property {string} codigo
 * @property {string} nombre
 * @property {string} presentacion
 * @property {string} concentracion
 * @property {number} stock
 * @property {number} activo
 */

/**
 * @file Repositorio del catálogo de medicamentos. Opera directamente en MySQL.
 */
export class MedicamentoRepository {
    /**
     * Lista el catálogo activo de medicamentos ordenado por nombre.
     * @returns {Promise<MedicamentoRecord[]>} Medicamentos activos.
     */
    async findAllActive() {
        const [rows] = await dataSource.query(
            `SELECT id, codigo, nombre, presentacion, concentracion, stock, activo
             FROM medicamentos
             WHERE activo = 1
             ORDER BY nombre ASC`
        );
        return rows;
    }

    /**
     * Recupera los medicamentos activos que coincidan con los identificadores indicados.
     * @param {number[]} ids Identificadores de medicamentos.
     * @returns {Promise<MedicamentoRecord[]>} Medicamentos encontrados.
     */
    async findActiveByIds(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return [];
        }
        const placeholders = ids.map(() => '?').join(', ');
        const [rows] = await dataSource.query(
            `SELECT id, codigo, nombre, presentacion, concentracion, stock, activo
             FROM medicamentos
             WHERE activo = 1 AND id IN (${placeholders})`,
            ids.map((id) => Number(id))
        );
        return rows;
    }

    /**
     * Registra un nuevo medicamento en el catálogo.
     * @param {{ codigo: string, nombre: string, presentacion: string, concentracion: string, stock: number }} data Datos.
     * @returns {Promise<MedicamentoRecord>} Medicamento creado.
     */
    async create(data) {
        const [result] = await dataSource.query(
            `INSERT INTO medicamentos (codigo, nombre, presentacion, concentracion, stock, activo)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [data.codigo, data.nombre, data.presentacion, data.concentracion, data.stock]
        );
        return {
            id: result.insertId,
            codigo: data.codigo,
            nombre: data.nombre,
            presentacion: data.presentacion,
            concentracion: data.concentracion,
            stock: data.stock,
            activo: 1
        };
    }
}

export const medicamentoRepository = new MedicamentoRepository();
