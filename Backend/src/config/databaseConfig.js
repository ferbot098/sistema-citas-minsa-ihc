import mysql from 'mysql2/promise';
import { applicationProperties } from './applicationProperties.js';

/**
 * @file Configuración del pool de conexiones MySQL (persistencia real).
 * @description Toda la capa de repositorios opera exclusivamente contra MySQL
 * mediante `pool.query(...)` / `pool.execute(...)` con consultas parametrizadas.
 * No existe modo en memoria ni simulación de datos: si la base de datos no está
 * disponible, el error se registra de forma explícita en consola y las consultas
 * fallarán en lugar de devolver datos falsos.
 */

const config = applicationProperties.datasource;

/**
 * Pool de conexiones a MySQL (TiDB Cloud / instancia local).
 * @type {mysql.Pool}
 */
export const dataSource = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: config.connectionLimit,
    queueLimit: 0,
    ...(config.ssl
        ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } }
        : {})
});

/**
 * Verifica la conectividad inicial con MySQL y registra explícitamente cualquier
 * error en consola. No activa ningún respaldo en memoria: la aplicación siempre
 * lee y escribe en la base de datos real.
 * @returns {Promise<boolean>} `true` si la conexión fue exitosa.
 */
export async function checkDatabaseConnection() {
    try {
        const connection = await dataSource.getConnection();
        connection.release();
        console.log(`[DataSource] Conexión MySQL establecida en ${config.host}:${config.port}/${config.database}`);
        return true;
    } catch (error) {
        console.error(
            `[DataSource] ERROR: no se pudo conectar a MySQL en ${config.host}:${config.port}/${config.database}. ` +
            `Detalle: ${error.message}. No se activará ningún modo en memoria; las consultas fallarán hasta restablecer la conexión.`
        );
        return false;
    }
}
