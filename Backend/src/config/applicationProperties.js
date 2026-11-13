import dotenv from 'dotenv';
dotenv.config();
/**
 * @typedef {Object} AppConfig
 * @property {{ port: number }} server
 * @property {{ jwtSecret: string, jwtExpiresHours: number }} security
 * @property {{ host: string, port: number, database: string, user: string, password: string, connectionLimit: number, ssl: boolean }} datasource
 */
/**
 * Propiedades centralizadas e inmutables de la aplicación.
 * @type {Readonly<AppConfig>}
 */
export const applicationProperties = Object.freeze({
    server: {
        port: Number(process.env.SERVER_PORT) || 3000
    },
    security: {
        jwtSecret: process.env.JWT_SECRET || 'minsa_ihc_upn_2026_clave_secreta_segura',
        jwtExpiresHours: Number(process.env.JWT_EXPIRES_HOURS) || 8
    },
    datasource: {
        host: process.env.SPRING_DATASOURCE_URL || 'localhost',
        port: Number(process.env.SPRING_DATASOURCE_PORT) || 3306,
        database: process.env.SPRING_DATASOURCE_DATABASE || 'minsa_citas',
        user: process.env.SPRING_DATASOURCE_USERNAME || 'root',
        password: process.env.SPRING_DATASOURCE_PASSWORD || '',
        connectionLimit: Number(process.env.SPRING_DATASOURCE_CONNECTION_LIMIT) || 10,
        ssl: process.env.SPRING_DATASOURCE_SSL === 'true'
    }
});
