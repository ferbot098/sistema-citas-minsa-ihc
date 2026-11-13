import { medicamentoRepository } from '../repositories/medicamentoRepository.js';

/**
 * @file Servicio del catálogo de medicamentos (capa de negocio).
 */
export class MedicamentoService {
    /**
     * Lista el catálogo activo de medicamentos.
     * @returns {Promise<Array<Object>>} Medicamentos activos.
     */
    async listarMedicamentos() {
        return await medicamentoRepository.findAllActive();
    }

    /**
     * Registra un nuevo medicamento validando sus datos obligatorios.
     * @param {{ codigo: string, nombre: string, presentacion: string, concentracion: string, stock: number|string }} payload Datos.
     * @returns {Promise<Object>} Medicamento creado.
     */
    async registrarMedicamento(payload) {
        const codigo = String(payload.codigo || '').trim().toUpperCase();
        const nombre = String(payload.nombre || '').trim();
        const presentacion = String(payload.presentacion || '').trim();
        const concentracion = String(payload.concentracion || '').trim();
        const stock = Number(payload.stock);

        if (!codigo || codigo.length < 3) {
            throw new Error('Ingrese un código de medicamento válido (mínimo 3 caracteres).');
        }
        if (nombre.length < 3) {
            throw new Error('Ingrese el nombre del medicamento.');
        }
        if (!presentacion || !concentracion) {
            throw new Error('Ingrese la presentación y la concentración del medicamento.');
        }
        if (Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
            throw new Error('El stock debe ser un número entero mayor o igual a cero.');
        }

        try {
            return await medicamentoRepository.create({ codigo, nombre, presentacion, concentracion, stock });
        } catch (error) {
            if (error && error.code === 'ER_DUP_ENTRY') {
                throw new Error('Ya existe un medicamento registrado con ese código.');
            }
            throw error;
        }
    }
}

export const medicamentoService = new MedicamentoService();
