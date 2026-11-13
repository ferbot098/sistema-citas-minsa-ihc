import { dataSource } from '../config/databaseConfig.js';

/**
 * @typedef {Object} UsuarioRecord
 * @property {number} id
 * @property {string} dni
 * @property {string|null} cmp
 * @property {string|null} email
 * @property {string} nombres
 * @property {string} telefono
 * @property {string} password_hash
 * @property {'PACIENTE'|'EMPLEADO'|'ADMIN'} rol
 * @property {number} rol_id
 * @property {number|null} medico_id
 * @property {number} activo
 */

/**
 * Repositorio de acceso a datos de usuarios. Opera exclusivamente contra MySQL.
 */
export class AuthRepository {
    /**
     * Busca un usuario activo por DNI, CMP o correo electrónico.
     * @param {string} identifier Identificador ingresado en el login.
     * @returns {Promise<UsuarioRecord|null>} Usuario o `null`.
     */
    async findByIdentifier(identifier) {
        const clean = identifier.trim();
        const [rows] = await dataSource.query(
            `SELECT * FROM usuarios
             WHERE activo = 1 AND (dni = ? OR LOWER(cmp) = LOWER(?) OR LOWER(email) = LOWER(?))
             LIMIT 1`,
            [clean, clean, clean]
        );
        return rows[0] || null;
    }

    /**
     * Recupera el identificador del rol a partir de su nombre.
     * @param {'PACIENTE'|'EMPLEADO'|'ADMIN'} nombre Nombre del rol.
     * @returns {Promise<number>} Identificador del rol.
     */
    async findRoleIdByName(nombre) {
        const [rows] = await dataSource.query(
            'SELECT id FROM roles WHERE nombre = ? LIMIT 1',
            [nombre]
        );
        if (!rows[0]) {
            throw new Error(`El rol ${nombre} no está registrado en la tabla roles.`);
        }
        return rows[0].id;
    }

    /**
     * Crea un nuevo usuario en MySQL asignando su rol_id correspondiente.
     * @param {Omit<UsuarioRecord, 'id'|'activo'|'rol_id'>} data Datos del usuario.
     * @returns {Promise<UsuarioRecord>} Usuario creado.
     */
    async createUser(data) {
        const rolId = await this.findRoleIdByName(data.rol);
        const [result] = await dataSource.query(
            `INSERT INTO usuarios (dni, cmp, email, nombres, telefono, password_hash, rol, rol_id, medico_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.dni,
                data.cmp || null,
                data.email || null,
                data.nombres,
                data.telefono,
                data.password_hash,
                data.rol,
                rolId,
                data.medico_id || null
            ]
        );
        return { id: result.insertId, ...data, rol_id: rolId, activo: 1 };
    }

    /**
     * Lista todos los usuarios registrados (sin exponer contraseñas) para el panel Admin.
     * @returns {Promise<Omit<UsuarioRecord, 'password_hash'>[]>} Usuarios.
     */
    async findAllUsers() {
        const [rows] = await dataSource.query(
            `SELECT u.id, u.dni, u.cmp, u.email, u.nombres, u.telefono, u.rol, u.rol_id,
                    u.medico_id, u.activo, u.creado_en, r.descripcion AS rol_descripcion
             FROM usuarios u
             INNER JOIN roles r ON r.id = u.rol_id
             ORDER BY u.rol ASC, u.nombres ASC`
        );
        return rows;
    }
}

export const authRepository = new AuthRepository();
