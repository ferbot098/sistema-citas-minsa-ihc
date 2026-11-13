import { dataSource } from '../config/databaseConfig.js';

/**
 * @file Repositorio de hospitales, médicos, horarios y citas.
 * @description Todas las operaciones se ejecutan directamente contra MySQL con
 * consultas parametrizadas. No existe ningún respaldo en memoria.
 */
export class CitaRepository {
    /**
     * Obtiene hospitales activos con sus especialidades vinculadas (RN-01, RN-02).
     * @returns {Promise<Array<Object>>} Hospitales con especialidades.
     */
    async findHospitalesConEspecialidades() {
        const [hospitales] = await dataSource.query(
            'SELECT * FROM hospitales WHERE activo = 1 ORDER BY nombre ASC'
        );
        const [relaciones] = await dataSource.query(
            `SELECT he.hospital_id, e.id, e.nombre, e.icono
             FROM hospital_especialidades he
             INNER JOIN especialidades e ON e.id = he.especialidad_id`
        );
        return hospitales.map((h) => ({
            id: h.id,
            nombre: h.nombre,
            red: h.red,
            distrito: h.distrito,
            direccion: h.direccion,
            lat: Number(h.latitud),
            lng: Number(h.longitud),
            especialidades: relaciones
                .filter((r) => r.hospital_id === h.id)
                .map(({ id, nombre, icono }) => ({ id, nombre, icono }))
        }));
    }

    /**
     * Recupera las especialidades existentes para un conjunto de identificadores.
     * @param {number[]} ids Identificadores de especialidad.
     * @returns {Promise<Array<{ id: number, nombre: string }>>} Especialidades encontradas.
     */
    async findEspecialidadesByIds(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return [];
        }
        const placeholders = ids.map(() => '?').join(', ');
        const [rows] = await dataSource.query(
            `SELECT id, nombre FROM especialidades WHERE id IN (${placeholders})`,
            ids.map((id) => Number(id))
        );
        return rows;
    }

    /**
     * Registra un nuevo hospital y asocia sus especialidades en una transacción SQL.
     * @param {{ nombre: string, red: string, distrito: string, direccion: string, latitud: number, longitud: number, especialidadIds: number[] }} data Datos del lugar.
     * @returns {Promise<Object>} Hospital creado con sus especialidades.
     */
    async createHospitalWithEspecialidades(data) {
        const connection = await dataSource.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query(
                `INSERT INTO hospitales (nombre, red, distrito, direccion, latitud, longitud, activo)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [data.nombre, data.red, data.distrito, data.direccion, data.latitud, data.longitud]
            );
            const hospitalId = result.insertId;
            for (const especialidadId of data.especialidadIds) {
                await connection.query(
                    'INSERT INTO hospital_especialidades (hospital_id, especialidad_id) VALUES (?, ?)',
                    [hospitalId, Number(especialidadId)]
                );
            }
            await connection.commit();
            return await this.findHospitalById(hospitalId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Busca un hospital por su identificador incluyendo sus especialidades.
     * @param {number} hospitalId Identificador del hospital.
     * @returns {Promise<Object|null>} Hospital o `null`.
     */
    async findHospitalById(hospitalId) {
        const [rows] = await dataSource.query(
            'SELECT * FROM hospitales WHERE id = ? LIMIT 1',
            [Number(hospitalId)]
        );
        const hospital = rows[0];
        if (!hospital) {
            return null;
        }
        const [especialidades] = await dataSource.query(
            `SELECT e.id, e.nombre, e.icono
             FROM hospital_especialidades he
             INNER JOIN especialidades e ON e.id = he.especialidad_id
             WHERE he.hospital_id = ?`,
            [Number(hospitalId)]
        );
        return {
            id: hospital.id,
            nombre: hospital.nombre,
            red: hospital.red,
            distrito: hospital.distrito,
            direccion: hospital.direccion,
            lat: Number(hospital.latitud),
            lng: Number(hospital.longitud),
            especialidades
        };
    }

    /**
     * Obtiene médicos activos y sus bloques horarios (RN-03, RF-04).
     * @param {{ hospitalId?: number, especialidadId?: number }} filters Filtros.
     * @returns {Promise<Array<Object>>} Médicos con horarios.
     */
    async findMedicosYHorarios(filters = {}) {
        let sql = `
            SELECT m.id, m.cmp, m.nombres AS nombre, m.foto, m.rating,
                   m.hospital_id AS hospitalId, h.nombre AS hospital,
                   m.especialidad_id AS especialidadId, e.nombre AS especialidad
            FROM medicos m
            INNER JOIN hospitales h ON h.id = m.hospital_id
            INNER JOIN especialidades e ON e.id = m.especialidad_id
            WHERE m.activo = 1 AND h.activo = 1
        `;
        const params = [];
        if (filters.hospitalId) {
            sql += ' AND m.hospital_id = ?';
            params.push(Number(filters.hospitalId));
        }
        if (filters.especialidadId) {
            sql += ' AND m.especialidad_id = ?';
            params.push(Number(filters.especialidadId));
        }
        sql += ' ORDER BY m.nombres ASC';
        const [medicos] = await dataSource.query(sql, params);
        const [horarios] = await dataSource.query(
            `SELECT id, medico_id, DATE_FORMAT(fecha, '%Y-%m-%d') AS dia, hora, disponible
             FROM horarios_disponibles
             ORDER BY fecha ASC, hora ASC`
        );
        return medicos.map((m) => ({
            ...m,
            rating: Number(m.rating),
            horarios: horarios
                .filter((hr) => hr.medico_id === m.id)
                .map((hr) => ({
                    id: hr.id,
                    dia: hr.dia,
                    hora: hr.hora,
                    disponible: hr.disponible === 1
                }))
        }));
    }

    /**
     * Crea una cita bloqueando el horario en transacción atómica (RN-04, RN-05, RF-10).
     * @param {{ pacienteId: number, dni: string, pacienteNombre: string, horarioId: number, codigoAtencion: string }} data Datos.
     * @returns {Promise<Object>} Cita creada.
     */
    async createCitaAtomic(data) {
        const connection = await dataSource.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.query(
                `SELECT hr.id, hr.medico_id, DATE_FORMAT(hr.fecha, '%Y-%m-%d') AS fecha, hr.hora, hr.disponible,
                        m.nombres AS medico_nombre, m.cmp, m.hospital_id, m.especialidad_id,
                        h.nombre AS hospital_nombre, e.nombre AS especialidad_nombre
                 FROM horarios_disponibles hr
                 INNER JOIN medicos m ON m.id = hr.medico_id
                 INNER JOIN hospitales h ON h.id = m.hospital_id
                 INNER JOIN especialidades e ON e.id = m.especialidad_id
                 WHERE hr.id = ?
                 FOR UPDATE`,
                [Number(data.horarioId)]
            );
            const slot = rows[0];
            if (!slot) {
                throw new Error('El bloque horario seleccionado no existe.');
            }
            if (slot.disponible !== 1) {
                throw new Error('Este horario ya fue reservado por otro paciente. Seleccione otro turno.');
            }
            await connection.query(
                'UPDATE horarios_disponibles SET disponible = 0 WHERE id = ?',
                [slot.id]
            );
            const medicoCompleto = `${slot.medico_nombre} (${slot.cmp})`;
            const [insertRes] = await connection.query(
                `INSERT INTO citas (
                    codigo_atencion, paciente_id, medico_id, horario_id, hospital_id, especialidad_id,
                    dni_paciente, nombre_paciente, hospital_nombre, especialidad_nombre, medico_nombre,
                    fecha_cita, hora_cita, estado
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RESERVADA')`,
                [
                    data.codigoAtencion,
                    data.pacienteId,
                    slot.medico_id,
                    slot.id,
                    slot.hospital_id,
                    slot.especialidad_id,
                    data.dni,
                    data.pacienteNombre,
                    slot.hospital_nombre,
                    slot.especialidad_nombre,
                    medicoCompleto,
                    slot.fecha,
                    slot.hora
                ]
            );
            await connection.commit();
            return {
                id: insertRes.insertId,
                codigo_atencion: data.codigoAtencion,
                paciente_id: data.pacienteId,
                medico_id: slot.medico_id,
                horario_id: slot.id,
                dni_paciente: data.dni,
                nombre_paciente: data.pacienteNombre,
                hospital_nombre: slot.hospital_nombre,
                especialidad_nombre: slot.especialidad_nombre,
                medico_nombre: medicoCompleto,
                fecha_cita: slot.fecha,
                hora_cita: slot.hora,
                estado: 'RESERVADA'
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Busca una cita por ID.
     * @param {number} citaId Identificador de la cita.
     * @returns {Promise<Object|null>} Cita o `null`.
     */
    async findCitaById(citaId) {
        const [rows] = await dataSource.query(
            `SELECT id, codigo_atencion, paciente_id, medico_id, horario_id, hospital_id, especialidad_id,
                    dni_paciente, nombre_paciente, hospital_nombre, especialidad_nombre, medico_nombre,
                    DATE_FORMAT(fecha_cita, '%Y-%m-%d') AS fecha_cita, hora_cita, estado, motivo_cambio
             FROM citas WHERE id = ? LIMIT 1`,
            [Number(citaId)]
        );
        return rows[0] || null;
    }

    /**
     * Lista citas filtradas según rol (RN-12: paciente solo ve las suyas; empleado ve su agenda; admin ve todas).
     * @param {{ pacienteId?: number, medicoId?: number }} scope Alcance.
     * @returns {Promise<Array<Object>>} Citas.
     */
    async findCitasByScope(scope = {}) {
        let sql = `
            SELECT id, codigo_atencion, paciente_id, medico_id, horario_id, hospital_id, especialidad_id,
                   dni_paciente, nombre_paciente, hospital_nombre, especialidad_nombre, medico_nombre,
                   DATE_FORMAT(fecha_cita, '%Y-%m-%d') AS fecha_cita, hora_cita, estado, motivo_cambio, creado_en
            FROM citas
            WHERE 1=1
        `;
        const params = [];
        if (scope.pacienteId) {
            sql += ' AND paciente_id = ?';
            params.push(Number(scope.pacienteId));
        }
        if (scope.medicoId) {
            sql += ' AND medico_id = ?';
            params.push(Number(scope.medicoId));
        }
        sql += ' ORDER BY fecha_cita DESC, hora_cita ASC, id DESC';
        const [rows] = await dataSource.query(sql, params);
        return rows;
    }

    /**
     * Reprograma una cita activa a un nuevo bloque libre y libera el anterior (RN-07, RF-07).
     * @param {number} citaId Identificador de la cita.
     * @param {number} nuevoHorarioId Identificador del nuevo horario.
     * @param {string} motivo Motivo del cambio.
     * @returns {Promise<Object>} Cita actualizada.
     */
    async reprogramarCitaAtomic(citaId, nuevoHorarioId, motivo) {
        const connection = await dataSource.getConnection();
        try {
            await connection.beginTransaction();
            const [citaRows] = await connection.query(
                'SELECT * FROM citas WHERE id = ? FOR UPDATE',
                [Number(citaId)]
            );
            const cita = citaRows[0];
            if (!cita) throw new Error('Cita no encontrada.');
            const [slotRows] = await connection.query(
                `SELECT hr.id, hr.medico_id, DATE_FORMAT(hr.fecha, '%Y-%m-%d') AS fecha, hr.hora, hr.disponible,
                        m.nombres AS medico_nombre, m.cmp, m.hospital_id, m.especialidad_id,
                        h.nombre AS hospital_nombre, e.nombre AS especialidad_nombre
                 FROM horarios_disponibles hr
                 INNER JOIN medicos m ON m.id = hr.medico_id
                 INNER JOIN hospitales h ON h.id = m.hospital_id
                 INNER JOIN especialidades e ON e.id = m.especialidad_id
                 WHERE hr.id = ?
                 FOR UPDATE`,
                [Number(nuevoHorarioId)]
            );
            const nuevoSlot = slotRows[0];
            if (!nuevoSlot || nuevoSlot.disponible !== 1) {
                throw new Error('El nuevo bloque horario no está disponible.');
            }
            await connection.query(
                'UPDATE horarios_disponibles SET disponible = 1 WHERE id = ?',
                [cita.horario_id]
            );
            await connection.query(
                'UPDATE horarios_disponibles SET disponible = 0 WHERE id = ?',
                [nuevoSlot.id]
            );
            const medicoCompleto = `${nuevoSlot.medico_nombre} (${nuevoSlot.cmp})`;
            await connection.query(
                `UPDATE citas
                 SET horario_id = ?, medico_id = ?, hospital_id = ?, especialidad_id = ?,
                     hospital_nombre = ?, especialidad_nombre = ?, medico_nombre = ?,
                     fecha_cita = ?, hora_cita = ?, estado = 'REPROGRAMADA', motivo_cambio = ?
                 WHERE id = ?`,
                [
                    nuevoSlot.id,
                    nuevoSlot.medico_id,
                    nuevoSlot.hospital_id,
                    nuevoSlot.especialidad_id,
                    nuevoSlot.hospital_nombre,
                    nuevoSlot.especialidad_nombre,
                    medicoCompleto,
                    nuevoSlot.fecha,
                    nuevoSlot.hora,
                    motivo || 'Reprogramado por el paciente',
                    cita.id
                ]
            );
            await connection.commit();
            return await this.findCitaById(cita.id);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Actualiza el estado de una cita (CANCELADA, ATENDIDA, INASISTENCIA) sin eliminar el registro (RN-08, RN-09).
     * @param {number} citaId Identificador de la cita.
     * @param {'CANCELADA'|'ATENDIDA'|'INASISTENCIA'} nuevoEstado Nuevo estado.
     * @param {string|null} [motivo] Motivo del cambio.
     * @returns {Promise<Object>} Cita actualizada.
     */
    async updateEstadoCitaAtomic(citaId, nuevoEstado, motivo = null) {
        const connection = await dataSource.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.query(
                'SELECT * FROM citas WHERE id = ? FOR UPDATE',
                [Number(citaId)]
            );
            const cita = rows[0];
            if (!cita) throw new Error('Cita no encontrada.');
            if (nuevoEstado === 'CANCELADA') {
                await connection.query(
                    'UPDATE horarios_disponibles SET disponible = 1 WHERE id = ?',
                    [cita.horario_id]
                );
            }
            await connection.query(
                'UPDATE citas SET estado = ?, motivo_cambio = ? WHERE id = ?',
                [nuevoEstado, motivo, cita.id]
            );
            await connection.commit();
            return await this.findCitaById(cita.id);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Crea un nuevo bloque horario para un médico (Panel Empleado / Admin).
     * @param {{ medicoId: number, fecha: string, hora: string }} data Datos del horario.
     * @returns {Promise<Object>} Horario creado.
     */
    async createHorario(data) {
        const [result] = await dataSource.query(
            'INSERT INTO horarios_disponibles (medico_id, fecha, hora, disponible) VALUES (?, ?, ?, 1)',
            [Number(data.medicoId), data.fecha, data.hora]
        );
        return {
            id: result.insertId,
            medico_id: Number(data.medicoId),
            fecha: data.fecha,
            hora: data.hora,
            disponible: 1
        };
    }
}

export const citaRepository = new CitaRepository();
