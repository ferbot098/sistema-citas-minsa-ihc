DROP DATABASE IF EXISTS minsa_citas;
CREATE DATABASE minsa_citas CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci;
USE minsa_citas;
-- ============================================================================
-- MODELO RELACIONAL COMPLETO - SISTEMA INCLUSIVO DE CITAS MÉDICAS (MINSA)
-- Tablas: roles, usuarios, hospitales (Lugares), especialidades,
-- hospital_especialidades, medicos, horarios_disponibles, citas,
-- medicamentos, diagnosticos, diagnostico_medicamentos
-- ============================================================================
-- 1. Roles del sistema (RN-ROL)
CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(20) NOT NULL UNIQUE,
    descripcion VARCHAR(120) NOT NULL
) ENGINE=InnoDB;
-- 2. Hospitales habilitados / Lugares de atención (RN-01)
CREATE TABLE hospitales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    red VARCHAR(80) NOT NULL,
    distrito VARCHAR(80) NOT NULL,
    direccion VARCHAR(200) NOT NULL,
    latitud DECIMAL(10, 7) NOT NULL,
    longitud DECIMAL(10, 7) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
-- 3. Especialidades médicas (RN-02)
CREATE TABLE especialidades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    icono VARCHAR(20) NOT NULL
) ENGINE=InnoDB;
-- 4. Catálogo de especialidades activas por hospital (RN-02)
CREATE TABLE hospital_especialidades (
    hospital_id INT NOT NULL,
    especialidad_id INT NOT NULL,
    PRIMARY KEY (hospital_id, especialidad_id),
    FOREIGN KEY (hospital_id) REFERENCES hospitales(id) ON DELETE CASCADE,
    FOREIGN KEY (especialidad_id) REFERENCES especialidades(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- 5. Médicos / Personal asistencial (RF-03, RN-03)
CREATE TABLE medicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cmp VARCHAR(20) NOT NULL UNIQUE,
    nombres VARCHAR(150) NOT NULL,
    especialidad_id INT NOT NULL,
    hospital_id INT NOT NULL,
    foto VARCHAR(20) NOT NULL DEFAULT '👨‍⚕️',
    rating DECIMAL(2, 1) NOT NULL DEFAULT 4.8,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    FOREIGN KEY (especialidad_id) REFERENCES especialidades(id),
    FOREIGN KEY (hospital_id) REFERENCES hospitales(id)
) ENGINE=InnoDB;
-- 6. Usuarios del sistema con división de roles (PACIENTE, EMPLEADO, ADMIN)
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dni VARCHAR(8) NOT NULL UNIQUE,
    cmp VARCHAR(20) NULL UNIQUE,
    email VARCHAR(150) NULL UNIQUE,
    nombres VARCHAR(150) NOT NULL,
    telefono VARCHAR(15) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol ENUM('PACIENTE', 'EMPLEADO', 'ADMIN') NOT NULL DEFAULT 'PACIENTE',
    rol_id INT NOT NULL,
    medico_id INT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rol_id) REFERENCES roles(id),
    FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE SET NULL
) ENGINE=InnoDB;
-- 7. Agenda de bloques horarios con unicidad estricta (RN-04, RF-04, RF-10)
CREATE TABLE horarios_disponibles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    medico_id INT NOT NULL,
    fecha DATE NOT NULL,
    hora VARCHAR(20) NOT NULL,
    disponible TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY uk_medico_fecha_hora (medico_id, fecha, hora),
    FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- 8. Citas médicas con trazabilidad de estados (RN-05, RN-07, RN-08, RN-09, RNF-SEG-02)
CREATE TABLE citas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_atencion VARCHAR(20) NOT NULL UNIQUE,
    paciente_id INT NOT NULL,
    medico_id INT NOT NULL,
    horario_id INT NOT NULL,
    hospital_id INT NOT NULL,
    especialidad_id INT NOT NULL,
    dni_paciente VARCHAR(8) NOT NULL,
    nombre_paciente VARCHAR(150) NOT NULL,
    hospital_nombre VARCHAR(150) NOT NULL,
    especialidad_nombre VARCHAR(100) NOT NULL,
    medico_nombre VARCHAR(150) NOT NULL,
    fecha_cita DATE NOT NULL,
    hora_cita VARCHAR(20) NOT NULL,
    estado ENUM('RESERVADA', 'REPROGRAMADA', 'CANCELADA', 'ATENDIDA', 'INASISTENCIA') NOT NULL DEFAULT 'RESERVADA',
    motivo_cambio VARCHAR(255) NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (paciente_id) REFERENCES usuarios(id),
    FOREIGN KEY (medico_id) REFERENCES medicos(id),
    FOREIGN KEY (horario_id) REFERENCES horarios_disponibles(id),
    FOREIGN KEY (hospital_id) REFERENCES hospitales(id),
    FOREIGN KEY (especialidad_id) REFERENCES especialidades(id)
) ENGINE=InnoDB;
-- 9. Catálogo de medicamentos (RF-FARM)
CREATE TABLE medicamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    presentacion VARCHAR(80) NOT NULL,
    concentracion VARCHAR(80) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
-- 10. Diagnósticos clínicos por cita atendida (RF-06)
CREATE TABLE diagnosticos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cita_id INT NOT NULL,
    codigo_cie10 VARCHAR(10) NOT NULL,
    descripcion TEXT NOT NULL,
    indicaciones_generales TEXT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_diagnostico_cita (cita_id),
    FOREIGN KEY (cita_id) REFERENCES citas(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- 11. Receta: medicamentos prescritos por diagnóstico (RF-06)
CREATE TABLE diagnostico_medicamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    diagnostico_id INT NOT NULL,
    medicamento_id INT NOT NULL,
    dosis VARCHAR(80) NOT NULL,
    frecuencia VARCHAR(80) NOT NULL,
    dias INT NOT NULL DEFAULT 1,
    FOREIGN KEY (diagnostico_id) REFERENCES diagnosticos(id) ON DELETE CASCADE,
    FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id)
) ENGINE=InnoDB;
-- ============================================================================
-- SEEDERS INICIALES (Datos de prueba verificados de T2, PC11 y PC12)
-- ============================================================================
INSERT INTO roles (id, nombre, descripcion) VALUES
(1, 'PACIENTE', 'Ciudadano que reserva y consulta sus citas médicas'),
(2, 'EMPLEADO', 'Personal asistencial que atiende la agenda médica'),
(3, 'ADMIN', 'Administrador de la red asistencial y del sistema');
INSERT INTO hospitales (id, nombre, red, distrito, direccion, latitud, longitud) VALUES
(1, 'Hospital Nacional Dos de Mayo', 'Lima Centro', 'Cercado de Lima', 'Parque Historia de la Medicina s/n, Alt. Cdra. 13 Av. Grau', -12.0538000, -77.0175000),
(2, 'Hospital Nacional Arzobispo Loayza', 'Lima Centro', 'Cercado de Lima', 'Av. Alfonso Ugarte 848, Cercado de Lima', -12.0464000, -77.0428000),
(3, 'Hospital Santa Rosa', 'Lima Centro', 'Pueblo Libre', 'Av. Bolívar cdra. 8 s/n, Pueblo Libre', -12.0728000, -77.0622000),
(4, 'Hospital Nacional Cayetano Heredia', 'Lima Norte', 'San Martín de Porres', 'Av. Honorio Delgado 262, San Martín de Porres', -12.0245000, -77.0567000),
(5, 'Hospital María Auxiliadora', 'Lima Sur', 'San Juan de Miraflores', 'Av. Miguel Iglesias 968, San Juan de Miraflores', -12.1627000, -76.9635000),
(6, 'Instituto Nacional de Oftalmología (INO)', 'Institutos Especializados', 'Cercado de Lima', 'Av. Tingo María 398, Cercado de Lima', -12.0526000, -77.0543000);
INSERT INTO especialidades (id, nombre, icono) VALUES
(1, 'Cardiología', '❤️'),
(2, 'Oftalmología', '👁️'),
(3, 'Medicina general', '🩺'),
(4, 'Pediatría', '🧸'),
(5, 'Gastroenterología', '🔬');
INSERT INTO hospital_especialidades (hospital_id, especialidad_id) VALUES
(1, 1), (1, 2), (1, 3),
(2, 2), (2, 3), (2, 5),
(3, 3), (3, 4),
(4, 1), (4, 3), (4, 4),
(5, 2), (5, 3),
(6, 2);
INSERT INTO medicos (id, cmp, nombres, especialidad_id, hospital_id, foto, rating) VALUES
(1, 'CMP 45120', 'Dr. Carlos Mendoza', 2, 1, '👨‍⚕️', 4.9),
(2, 'CMP 33912', 'Dra. Elena Silva', 1, 1, '👩‍⚕️', 4.9),
(3, 'CMP 45675', 'Dra. Paula Navarro', 2, 2, '👩‍⚕️', 4.8),
(4, 'CMP 51240', 'Dr. Manuel Valdivia', 5, 2, '👨‍⚕️', 4.7),
(5, 'CMP 39811', 'Dr. Hugo Paredes', 2, 6, '👨‍⚕️', 4.9);
-- Contraseñas cifradas con scrypt:
-- Pacientes: "123456" | Empleados: "med123" | Admin: "admin123"
INSERT INTO usuarios (id, dni, cmp, email, nombres, telefono, password_hash, rol, rol_id, medico_id) VALUES
(1, '01812548', NULL, 'telmo.paciente@minsa.gob.pe', 'Don Telmo', '987654321', 'minsa_salt_paciente_01:545829be462ccf030ba330e582e9ff73108b886f196ad21c2a043fbadd77408239d2097b212e8f42408cf6be31e188c1a86e73ab8a64be74d16bf87e60a059d2', 'PACIENTE', 1, NULL),
(2, '12345678', NULL, 'demo.paciente@minsa.gob.pe', 'María Elena Quispe', '999111222', 'minsa_salt_paciente_01:545829be462ccf030ba330e582e9ff73108b886f196ad21c2a043fbadd77408239d2097b212e8f42408cf6be31e188c1a86e73ab8a64be74d16bf87e60a059d2', 'PACIENTE', 1, NULL),
(3, '40112233', 'CMP 45120', 'cmendoza@minsa.gob.pe', 'Dr. Carlos Mendoza', '988776655', 'minsa_salt_empleado_01:4c5772f1d89d5d0203a2d85be0e732a3cc9fe5edd373fae8d69b8cc1ca52b66b904e1315f4d9d175d0c68b8f77f93bbb2303d71767b7a66edd42de7812ae3a7d', 'EMPLEADO', 2, 1),
(4, '40223344', 'CMP 33912', 'esilva@minsa.gob.pe', 'Dra. Elena Silva', '988776644', 'minsa_salt_empleado_01:4c5772f1d89d5d0203a2d85be0e732a3cc9fe5edd373fae8d69b8cc1ca52b66b904e1315f4d9d175d0c68b8f77f93bbb2303d71767b7a66edd42de7812ae3a7d', 'EMPLEADO', 2, 2),
(5, '70000001', NULL, 'admin@minsa.gob.pe', 'Administrador General MINSA', '013156600', 'minsa_salt_admin_01:14e8e6ba15c14602df4699892f11a0b81469469bf0baf0fd367e70b45b23053f345761969c6ef1de733a43a16bb005489a513aaddb56dd44a7254e3463c51366', 'ADMIN', 3, NULL);
-- Horarios de Octubre y Noviembre 2026
INSERT INTO horarios_disponibles (id, medico_id, fecha, hora, disponible) VALUES
(1, 1, '2026-10-20', '08:30 AM', 1),
(2, 1, '2026-10-20', '09:15 AM', 1),
(3, 1, '2026-10-21', '10:00 AM', 1),
(4, 2, '2026-10-20', '09:00 AM', 1),
(5, 2, '2026-10-20', '11:00 AM', 0),
(6, 3, '2026-10-30', '03:30 PM', 1),
(7, 4, '2026-11-05', '10:30 AM', 1),
(8, 5, '2026-11-10', '08:30 AM', 0),
(9, 1, '2026-11-12', '09:00 AM', 0),
(10, 2, '2026-11-14', '10:00 AM', 0);
-- Citas históricas iniciales para el historial y métricas del Dashboard (PC12)
INSERT INTO citas (id, codigo_atencion, paciente_id, medico_id, horario_id, hospital_id, especialidad_id, dni_paciente, nombre_paciente, hospital_nombre, especialidad_nombre, medico_nombre, fecha_cita, hora_cita, estado) VALUES
(1, 'M-4088', 2, 2, 5, 1, 1, '12345678', 'María Elena Quispe', 'Hospital Nacional Dos de Mayo', 'Cardiología', 'Dra. Elena Silva (CMP 33912)', '2026-10-20', '11:00 AM', 'ATENDIDA'),
(2, 'M-4089', 2, 5, 8, 6, 2, '12345678', 'María Elena Quispe', 'Instituto Nacional de Oftalmología (INO)', 'Oftalmología', 'Dr. Hugo Paredes (CMP 39811)', '2026-11-10', '08:30 AM', 'RESERVADA'),
(3, 'M-4090', 1, 1, 9, 1, 2, '01812548', 'Don Telmo', 'Hospital Nacional Dos de Mayo', 'Oftalmología', 'Dr. Carlos Mendoza (CMP 45120)', '2026-11-12', '09:00 AM', 'ATENDIDA'),
(4, 'M-4091', 2, 2, 10, 1, 1, '12345678', 'María Elena Quispe', 'Hospital Nacional Dos de Mayo', 'Cardiología', 'Dra. Elena Silva (CMP 33912)', '2026-11-14', '10:00 AM', 'INASISTENCIA');
-- Catálogo de medicamentos
INSERT INTO medicamentos (id, codigo, nombre, presentacion, concentracion, stock) VALUES
(1, 'MED-0001', 'Paracetamol', 'Tableta', '500 mg', 240),
(2, 'MED-0002', 'Ibuprofeno', 'Tableta', '400 mg', 180),
(3, 'MED-0003', 'Amoxicilina', 'Cápsula', '500 mg', 120),
(4, 'MED-0004', 'Loratadina', 'Tableta', '10 mg', 150),
(5, 'MED-0005', 'Omeprazol', 'Cápsula', '20 mg', 200),
(6, 'MED-0006', 'Solución oftálmica lubricante', 'Gotas', '0.5%', 90),
(7, 'MED-0007', 'Enalapril', 'Tableta', '10 mg', 130),
(8, 'MED-0008', 'Salbutamol', 'Inhalador', '100 mcg', 75);
-- Diagnósticos y recetas de ejemplo para las citas ya atendidas
INSERT INTO diagnosticos (id, cita_id, codigo_cie10, descripcion, indicaciones_generales) VALUES
(1, 1, 'I10', 'Hipertensión arterial esencial primaria.', 'Control de presión arterial cada 15 días, dieta baja en sodio y actividad física moderada.'),
(2, 3, 'H52.1', 'Miopía leve con ojo seco asociado.', 'Uso de lubricante oftálmico, evitar pantallas prolongadas y control en 3 meses.');
INSERT INTO diagnostico_medicamentos (diagnostico_id, medicamento_id, dosis, frecuencia, dias) VALUES
(1, 7, '1 tableta', 'Cada 24 horas', 30),
(1, 1, '1 tableta', 'Cada 8 horas si hay dolor', 5),
(2, 6, '1 gota por ojo', 'Cada 6 horas', 14),
(2, 1, '1 tableta', 'Cada 12 horas si hay molestia', 3);
