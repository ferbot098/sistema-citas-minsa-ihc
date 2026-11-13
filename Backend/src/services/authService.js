import crypto from 'crypto';
import { authRepository } from '../repositories/authRepository.js';
import { signJwtToken } from '../middlewares/authMiddleware.js';
export class AuthService {
    /**
     * Genera un hash seguro con scrypt y salt aleatorio.
     * @param {string} plainPassword
     * @returns {string}
     */
    hashPassword(plainPassword) {
        const salt = crypto.randomBytes(16).toString('hex');
        const derived = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
        return `${salt}:${derived}`;
    }
    /**
     * Verifica una contraseña en texto plano frente al hash almacenado.
     * @param {string} plainPassword
     * @param {string} storedHash
     * @returns {boolean}
     */
    verifyPassword(plainPassword, storedHash) {
        const [salt, key] = storedHash.split(':');
        if (!salt || !key) return false;
        const derivedBuf = crypto.scryptSync(plainPassword, salt, 64);
        const keyBuf = Buffer.from(key, 'hex');
        return derivedBuf.length === keyBuf.length && crypto.timingSafeEqual(derivedBuf, keyBuf);
    }
    /**
     * Autentica a un usuario (PACIENTE, EMPLEADO o ADMIN) y emite su token JWT.
     * @param {{ identificador: string, password: string }} credentials
     * @returns {Promise<{ token: string, usuario: Object }>}
     */
    async login(credentials) {
        const { identificador, password } = credentials;
        if (!identificador || !password) {
            throw new Error('Debe ingresar su identificador (DNI, CMP o correo) y su contraseña.');
        }
        const user = await authRepository.findByIdentifier(identificador);
        if (!user || !this.verifyPassword(password, user.password_hash)) {
            throw new Error('Credenciales incorrectas. Verifique su usuario y contraseña.');
        }
        const payload = {
            id: user.id,
            dni: user.dni,
            nombres: user.nombres,
            rol: user.rol,
            medicoId: user.medico_id || null
        };
        const token = signJwtToken(payload);
        return {
            token,
            usuario: {
                id: user.id,
                dni: user.dni,
                cmp: user.cmp,
                email: user.email,
                nombres: user.nombres,
                telefono: user.telefono,
                rol: user.rol,
                medicoId: user.medico_id || null
            }
        };
    }
    /**
     * Traduce los errores de unicidad de MySQL a mensajes legibles en español.
     * @param {any} error Error capturado.
     * @returns {Error} Error traducido.
     */
    traducirErrorPersistencia(error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            return new Error('Ya existe un usuario registrado con ese DNI, correo electrónico o CMP.');
        }
        return error instanceof Error ? error : new Error(String(error));
    }
    /**
     * Registra un nuevo ciudadano con rol PACIENTE (auto-registro) en MySQL.
     * @param {{ dni: string, nombres: string, telefono: string, email?: string, password?: string }} payload
     * @returns {Promise<{ token: string, usuario: Object }>}
     */
    async registerPaciente(payload) {
        const { dni, nombres, telefono, email, password } = payload;
        if (!/^\d{8}$/.test(String(dni || '').trim())) {
            throw new Error('El DNI debe contener exactamente 8 dígitos numéricos.');
        }
        if (!nombres || nombres.trim().length < 3) {
            throw new Error('Ingrese sus nombres y apellidos completos.');
        }
        if (!telefono || String(telefono).trim().length < 7) {
            throw new Error('Ingrese un número de teléfono válido.');
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
            throw new Error('Ingrese un correo electrónico válido o déjelo vacío.');
        }
        const claveFinal = password && password.trim().length >= 4 ? password.trim() : '123456';
        const passwordHash = this.hashPassword(claveFinal);
        let created;
        try {
            created = await authRepository.createUser({
                dni: dni.trim(),
                cmp: null,
                email: email ? email.trim() : null,
                nombres: nombres.trim(),
                telefono: String(telefono).trim(),
                password_hash: passwordHash,
                rol: 'PACIENTE',
                medico_id: null
            });
        } catch (error) {
            throw this.traducirErrorPersistencia(error);
        }
        const token = signJwtToken({
            id: created.id,
            dni: created.dni,
            nombres: created.nombres,
            rol: 'PACIENTE',
            medicoId: null
        });
        return {
            token,
            usuario: {
                id: created.id,
                dni: created.dni,
                email: created.email,
                nombres: created.nombres,
                telefono: created.telefono,
                rol: 'PACIENTE',
                medicoId: null
            }
        };
    }
    /**
     * Permite a un ADMIN crear cuentas institucionales de EMPLEADO o ADMIN.
     * @param {{ dni: string, cmp?: string, email: string, nombres: string, telefono: string, password: string, rol: 'EMPLEADO'|'ADMIN', medicoId?: number }} payload
     * @returns {Promise<Object>}
     */
    async createStaffAccount(payload) {
        const { dni, cmp, email, nombres, telefono, password, rol, medicoId } = payload;
        if (!['EMPLEADO', 'ADMIN'].includes(rol)) {
            throw new Error('El rol institucional debe ser EMPLEADO o ADMIN.');
        }
        if (!/^\d{8}$/.test(String(dni || '').trim()) || !email || !nombres || !password) {
            throw new Error('Complete DNI (8 dígitos), correo, nombres y contraseña.');
        }
        const created = await authRepository.createUser({
            dni: dni.trim(),
            cmp: cmp ? cmp.trim() : null,
            email: email.trim(),
            nombres: nombres.trim(),
            telefono: String(telefono || '013156600').trim(),
            password_hash: this.hashPassword(password),
            rol,
            medico_id: rol === 'EMPLEADO' && medicoId ? Number(medicoId) : null
        }).catch((error) => {
            throw this.traducirErrorPersistencia(error);
        });
        const { password_hash, ...safeUser } = created;
        return safeUser;
    }
    /**
     * Lista todos los usuarios del sistema para el módulo administrativo.
     * @returns {Promise<Array<Object>>}
     */
    async listUsuarios() {
        return await authRepository.findAllUsers();
    }
}
export const authService = new AuthService();
