/**
 * @file Portal del paciente: reserva en cuatro pasos e historial de citas.
 * @description Consume la API REST con JWT, bloquea cupos mediante la reserva
 * atómica del backend y permite reprogramar o cancelar únicamente las citas
 * del paciente autenticado.
 * @module paciente
 */

import {
    requireRole,
    getUsuario,
    getHospitales,
    getDoctores,
    getCitas,
    reservarCita,
    reprogramarCita,
    cancelarCita,
    getDiagnosticoPorCita,
    logout
} from './services/apiClient.js';
import { initAccessibility, announce, escapeHtml } from './shared/accessibility.js';

/**
 * @typedef {Object} Hospital
 * @property {number} id
 * @property {string} nombre
 * @property {string} red
 * @property {string} distrito
 * @property {string} direccion
 * @property {Array<{ id: number, nombre: string, icono: string }>} especialidades
 */

/**
 * @typedef {Object} Horario
 * @property {number} id
 * @property {string} dia
 * @property {string} hora
 * @property {boolean} disponible
 */

/**
 * @typedef {Object} Medico
 * @property {number} id
 * @property {string} cmp
 * @property {string} nombre
 * @property {string} hospital
 * @property {string} especialidad
 * @property {number} rating
 * @property {Horario[]} horarios
 */

/**
 * Estado local del portal del paciente.
 * @type {{
 *   usuario: Record<string, any> | null,
 *   hospitales: Hospital[],
 *   hospital: Hospital | null,
 *   especialidad: { id: number, nombre: string, icono?: string } | null,
 *   medicos: Medico[],
 *   horario: (Horario & { medico?: Medico }) | null,
 *   citas: Array<Record<string, any>>,
 *   citaReprogramar: Record<string, any> | null,
 *   citaCancelar: Record<string, any> | null
 * }}
 */
const estado = {
    usuario: null,
    hospitales: [],
    hospital: null,
    especialidad: null,
    medicos: [],
    horario: null,
    citas: [],
    citaReprogramar: null,
    citaEditar: null,
    mapaPaciente: null,
    marcadorPaciente: null
};

const MAPA_ESTADOS = Object.freeze({
    RESERVADA: { clase: 'state--reservada', icono: '✔', texto: 'Reservada' },
    REPROGRAMADA: { clase: 'state--reprogramada', icono: '🔁', texto: 'Reprogramada' },
    ATENDIDA: { clase: 'state--atendida', icono: '🩺', texto: 'Atendida' },
    CANCELADA: { clase: 'state--cancelada', icono: '✖', texto: 'Cancelada' },
    INASISTENCIA: { clase: 'state--inasistencia', icono: '⚠', texto: 'Inasistencia' }
});

/**
 * Indica si una cita admite acciones de reprogramación o cancelación.
 * @param {string} estadoCita Estado de la cita.
 * @returns {boolean} `true` si la cita está activa.
 */
function esCitaActiva(estadoCita) {
    return estadoCita === 'RESERVADA' || estadoCita === 'REPROGRAMADA';
}

/**
 * Formatea una fecha ISO `YYYY-MM-DD` en español peruano.
 * @param {string} valor Fecha en formato ISO corto.
 * @returns {string} Fecha legible.
 */
function formatFecha(valor) {
    if (!valor) {
        return '—';
    }
    const partes = String(valor).slice(0, 10).split('-').map(Number);
    if (partes.length !== 3 || partes.some((n) => Number.isNaN(n))) {
        return String(valor);
    }
    const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
    try {
        return new Intl.DateTimeFormat('es-PE', {
            weekday: 'short',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        }).format(fecha);
    } catch {
        return String(valor);
    }
}

/**
 * Devuelve el HTML accesible de una insignia de estado (icono + texto).
 * @param {string} estadoCita Estado de la cita.
 * @returns {string} HTML seguro de la insignia.
 */
function htmlEstado(estadoCita) {
    const meta = MAPA_ESTADOS[estadoCita] || { clase: 'state--neutral', icono: '•', texto: estadoCita };
    return `<span class="state ${meta.clase}"><span class="state-icon" aria-hidden="true">${meta.icono}</span>${escapeHtml(meta.texto)}</span>`;
}

/**
 * Muestra u oculta un mensaje de error general del asistente de reserva.
 * @param {string | null} mensaje Mensaje a mostrar o `null` para ocultar.
 * @returns {void}
 */
function mostrarErrorReserva(mensaje) {
    const contenedor = document.getElementById('reserva-alert');
    const texto = document.getElementById('reserva-alert-texto');
    if (!mensaje) {
        contenedor.hidden = true;
        return;
    }
    texto.textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, 'assertive');
}

/**
 * Muestra u oculta el error del paso de confirmación.
 * @param {string | null} mensaje Mensaje o `null`.
 * @returns {void}
 */
function mostrarErrorConfirmacion(mensaje) {
    const contenedor = document.getElementById('reserva-confirmar-alert');
    const texto = document.getElementById('reserva-confirmar-alert-texto');
    if (!mensaje) {
        contenedor.hidden = true;
        return;
    }
    texto.textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, 'assertive');
}

/**
 * Muestra un aviso en la sección de historial.
 * @param {string} mensaje Texto del aviso.
 * @param {'info'|'success'|'error'} [tipo='info'] Tipo visual.
 * @returns {void}
 */
function mostrarAvisoHistorial(mensaje, tipo = 'info') {
    const contenedor = document.getElementById('historial-alert');
    const texto = document.getElementById('historial-alert-texto');
    contenedor.className = `alert alert-${tipo === 'error' ? 'error' : tipo}`;
    texto.textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, tipo === 'error' ? 'assertive' : 'polite');
}

/**
 * Actualiza el indicador de pasos de la reserva.
 * @param {number} pasoActivo Número de paso activo (1 a 5).
 * @returns {void}
 */
function actualizarStepper(pasoActivo) {
    document.querySelectorAll('.stepper-item').forEach((item) => {
        const numero = Number(item.dataset.paso);
        item.removeAttribute('aria-current');
        item.classList.toggle('is-complete', numero < pasoActivo);
        if (numero === pasoActivo) {
            item.setAttribute('aria-current', 'step');
        }
    });
}

/**
 * Muestra un panel del asistente y oculta los demás.
 * @param {number} paso Número de paso (1 a 5).
 * @returns {void}
 */
function irAPaso(paso) {
    [1, 2, 3, 4].forEach((numero) => {
        const panel = document.getElementById(`panel-paso-${numero}`);
        if (panel) {
            panel.hidden = numero !== paso;
        }
    });
    const confirmacion = document.getElementById('panel-confirmacion');
    confirmacion.hidden = paso !== 5;
    actualizarStepper(paso);

    const titulo = paso === 5
        ? document.getElementById('titulo-confirmacion')
        : document.getElementById(`titulo-paso-${paso}`);
    if (titulo) {
        titulo.focus();
    }
}

/**
 * Marca visualmente la tarjeta de la opción seleccionada dentro de un contenedor.
 * @param {HTMLElement} contenedor Contenedor de tarjetas.
 * @returns {void}
 */
function marcarSeleccion(contenedor) {
    contenedor.querySelectorAll('.choice-card, .slot-card').forEach((tarjeta) => {
        const input = tarjeta.querySelector('input[type="radio"]');
        tarjeta.classList.toggle('is-selected', Boolean(input && input.checked));
    });
}

/**
 * Renderiza las tarjetas de hospitales.
 * @returns {void}
 */
function renderHospitales() {
    const contenedor = document.getElementById('lista-hospitales');
    if (estado.hospitales.length === 0) {
        contenedor.innerHTML = '<p class="empty-state">No hay hospitales activos disponibles en este momento.</p>';
        return;
    }

    contenedor.innerHTML = estado.hospitales.map((hospital) => {
        const seleccionado = estado.hospital && estado.hospital.id === hospital.id;
        return `
            <label class="choice-card${seleccionado ? ' is-selected' : ''}">
                <input type="radio" name="hospital" value="${hospital.id}"${seleccionado ? ' checked' : ''}>
                <span class="choice-body">
                    <span class="choice-title">${escapeHtml(hospital.nombre)}</span>
                    <span class="choice-meta">Red ${escapeHtml(hospital.red)} · ${escapeHtml(hospital.distrito)}</span>
                    <span class="choice-meta">${escapeHtml(hospital.direccion)}</span>
                    <span class="choice-badge">${hospital.especialidades.length} especialidades</span>
                </span>
            </label>
        `;
    }).join('');
}

/**
 * Coordenadas de respaldo (Plaza Mayor de Lima) cuando el hospital no informa ubicación.
 * @type {{ lat: number, lng: number }}
 */
const COORDENADAS_RESPALDO = Object.freeze({ lat: -12.046374, lng: -77.042793 });

/**
 * Obtiene coordenadas numéricas válidas de un hospital.
 * El endpoint `GET /api/hospitales` devuelve los campos `lat` y `lng`.
 * @param {Hospital | Record<string, any>} hospital Hospital con coordenadas.
 * @returns {{ lat: number, lng: number }} Coordenadas con respaldo de Lima.
 */
function obtenerCoordenadas(hospital) {
    const lat = parseFloat(hospital.lat ?? hospital.latitud);
    const lng = parseFloat(hospital.lng ?? hospital.longitud);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
    }
    return { lat: COORDENADAS_RESPALDO.lat, lng: COORDENADAS_RESPALDO.lng };
}

/**
 * Construye el enlace directo de búsqueda en Google Maps para unas coordenadas.
 * @param {number} lat Latitud.
 * @param {number} lng Longitud.
 * @returns {string} URL de Google Maps.
 */
function urlGoogleMaps(lat, lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/**
 * Inicializa el mapa Leaflet del hospital seleccionado.
 * @returns {void}
 */
function inicializarMapaPaciente() {
    const leafletDisponible = Boolean(window.L && typeof window.L.map === 'function');
    if (leafletDisponible && !estado.mapaPaciente) {
        const contenedor = document.getElementById('mapa-paciente');
        if (!contenedor) return;
        estado.mapaPaciente = window.L.map(contenedor, { scrollWheelZoom: false });
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(estado.mapaPaciente);
    }
}

/**
 * Actualiza el mapa, la información textual y el enlace a Google Maps
 * según el hospital seleccionado.
 * @returns {void}
 */
function actualizarMapaHospital() {
    const hospital = estado.hospital;
    const contenedor = document.getElementById('mapa-hospital-contenedor');
    const info = document.getElementById('mapa-hospital-info');
    const enlace = document.getElementById('btn-abrir-gmaps-paciente');

    if (!hospital || !contenedor) {
        if (contenedor) contenedor.hidden = true;
        return;
    }

    contenedor.hidden = false;
    contenedor.style.display = 'block';

    const { lat, lng } = obtenerCoordenadas(hospital);
    const red = hospital.red ? `Red ${hospital.red} · ` : '';
    info.textContent = `${hospital.nombre} · ${red}${hospital.distrito} · ${hospital.direccion} · Coordenadas: ${lat}, ${lng}.`;

    if (enlace) {
        enlace.href = urlGoogleMaps(lat, lng);
    }

    const popup = `<b>${escapeHtml(hospital.nombre)}</b><br>${escapeHtml(hospital.distrito)} · ${escapeHtml(hospital.direccion)}`;
    inicializarMapaPaciente();
    if (estado.mapaPaciente) {
        if (estado.marcadorPaciente) {
            estado.marcadorPaciente.setLatLng([lat, lng]);
            estado.marcadorPaciente.setPopupContent(popup);
        } else {
            estado.marcadorPaciente = window.L.marker([lat, lng]).addTo(estado.mapaPaciente)
                .bindPopup(popup);
        }
        estado.mapaPaciente.setView([lat, lng], 15);
        estado.mapaPaciente.invalidateSize();
        setTimeout(() => estado.mapaPaciente.invalidateSize(), 200);
    }
}

/**
 * Renderiza las especialidades del hospital seleccionado.
 * @returns {void}
 */
function renderEspecialidades() {
    const contenedor = document.getElementById('lista-especialidades');
    const hospital = estado.hospital;
    if (!hospital) {
        contenedor.innerHTML = '<p class="empty-state">Seleccione primero un hospital.</p>';
        return;
    }

    document.getElementById('hospital-elegido').textContent = `Hospital: ${hospital.nombre}.`;

    if (!hospital.especialidades || hospital.especialidades.length === 0) {
        contenedor.innerHTML = '<p class="empty-state">Este hospital no tiene especialidades activas registradas.</p>';
        return;
    }

    contenedor.innerHTML = hospital.especialidades.map((especialidad) => {
        const seleccionado = estado.especialidad && estado.especialidad.id === especialidad.id;
        return `
            <label class="choice-card${seleccionado ? ' is-selected' : ''}">
                <input type="radio" name="especialidad" value="${especialidad.id}"${seleccionado ? ' checked' : ''}>
                <span class="choice-body">
                    <span class="choice-title">${escapeHtml(especialidad.icono || '🩺')} ${escapeHtml(especialidad.nombre)}</span>
                    <span class="choice-meta">Disponible en ${escapeHtml(hospital.nombre)}</span>
                </span>
            </label>
        `;
    }).join('');
}

/**
 * Renderiza médicos y bloques horarios del hospital y especialidad elegidos.
 * @returns {void}
 */
function renderMedicos() {
    const contenedor = document.getElementById('lista-medicos');
    if (estado.especialidad) {
        document.getElementById('especialidad-elegida').textContent =
            `Especialidad: ${estado.especialidad.nombre} · Hospital: ${estado.hospital ? estado.hospital.nombre : ''}.`;
    }

    if (estado.medicos.length === 0) {
        contenedor.innerHTML = '<p class="empty-state">No hay médicos disponibles para esta especialidad en el hospital seleccionado.</p>';
        return;
    }

    contenedor.innerHTML = estado.medicos.map((medico) => {
        const horarios = Array.isArray(medico.horarios) ? medico.horarios : [];
        const slots = horarios.length === 0
            ? '<p class="empty-state">Este médico no tiene bloques horarios registrados.</p>'
            : `<div class="slot-grid" role="radiogroup" aria-label="Horarios de ${escapeHtml(medico.nombre)}">
                    ${horarios.map((horario) => {
                        const seleccionado = estado.horario && Number(estado.horario.id) === Number(horario.id);
                        const disponible = Boolean(horario.disponible);
                        return `
                            <label class="slot-card${disponible ? '' : ' is-disabled'}${seleccionado ? ' is-selected' : ''}">
                                <input type="radio" name="horario" value="${horario.id}"${disponible ? '' : ' disabled'}${seleccionado ? ' checked' : ''}>
                                <span>
                                    <span class="slot-date">${escapeHtml(formatFecha(horario.dia))}</span>
                                    <span class="slot-time">${escapeHtml(horario.hora)} · ${disponible ? 'Disponible' : 'Ocupado'}</span>
                                </span>
                            </label>
                        `;
                    }).join('')}
                </div>`;

        return `
            <article class="doctor-block">
                <div class="doctor-head">
                    <h3>${escapeHtml(medico.nombre)}</h3>
                    <span class="chip">${escapeHtml(medico.cmp || 'CMP no registrado')}</span>
                    <span class="chip">★ ${escapeHtml(String(medico.rating ?? ''))}</span>
                </div>
                ${slots}
            </article>
        `;
    }).join('');
}

/**
 * Carga los hospitales activos desde la API.
 * @returns {Promise<void>}
 */
async function cargarHospitales() {
    const contenedor = document.getElementById('lista-hospitales');
    contenedor.innerHTML = '<p class="loading-state"><span class="loading-spinner" aria-hidden="true"></span> Cargando hospitales…</p>';
    try {
        estado.hospitales = await getHospitales();
        renderHospitales();
    } catch (error) {
        contenedor.innerHTML = '<p class="empty-state">No se pudo cargar el catálogo de hospitales.</p>';
        mostrarErrorReserva(error.message || 'No se pudo cargar el catálogo de hospitales.');
    }
}

/**
 * Carga los médicos y horarios según la selección actual.
 * @returns {Promise<void>}
 */
async function cargarMedicos() {
    const contenedor = document.getElementById('lista-medicos');
    contenedor.innerHTML = '<p class="loading-state"><span class="loading-spinner" aria-hidden="true"></span> Cargando médicos y horarios…</p>';
    try {
        estado.medicos = await getDoctores({
            hospitalId: estado.hospital ? estado.hospital.id : undefined,
            especialidadId: estado.especialidad ? estado.especialidad.id : undefined
        });
        renderMedicos();
    } catch (error) {
        contenedor.innerHTML = '<p class="empty-state">No se pudieron cargar los horarios disponibles.</p>';
        mostrarErrorReserva(error.message || 'No se pudieron cargar los horarios disponibles.');
    }
}

/**
 * Actualiza el resumen del paciente antes de confirmar la reserva.
 * @returns {void}
 */
function pintarResumen() {
    const usuario = estado.usuario;
    const hospital = estado.hospital;
    const especialidad = estado.especialidad;
    const horario = estado.horario;
    const medico = horario && horario.medico ? horario.medico : null;

    document.getElementById('resumen-paciente').textContent = usuario ? usuario.nombres : '—';
    document.getElementById('resumen-dni').textContent = usuario ? usuario.dni : '—';
    document.getElementById('resumen-especialidad').textContent = especialidad ? especialidad.nombre : '—';
    document.getElementById('resumen-medico').textContent = medico ? `${medico.nombre} (${medico.cmp})` : '—';
    document.getElementById('resumen-fecha').textContent = horario ? formatFecha(horario.dia) : '—';
    document.getElementById('resumen-hora').textContent = horario ? horario.hora : '—';

    const hospitalResumen = document.getElementById('resumen-hospital');
    hospitalResumen.textContent = hospital ? hospital.nombre : '—';

    const enlacePrevio = document.getElementById('resumen-hospital-maps');
    if (enlacePrevio) {
        enlacePrevio.remove();
    }

    if (hospital) {
        const { lat, lng } = obtenerCoordenadas(hospital);
        const enlace = document.createElement('a');
        enlace.id = 'resumen-hospital-maps';
        enlace.href = urlGoogleMaps(lat, lng);
        enlace.target = '_blank';
        enlace.rel = 'noopener noreferrer';
        enlace.className = 'btn btn-secondary btn-small';
        enlace.style.marginLeft = '0.5rem';
        enlace.textContent = '📍 Ver en Google Maps';
        hospitalResumen.append(' ', enlace);
    }
}

/**
 * Devuelve el enlace de Google Maps para el hospital de una cita del historial.
 * @param {Record<string, any>} cita Cita del historial.
 * @returns {string} URL de Google Maps.
 */
function urlMapaCita(cita) {
    const hospital = estado.hospitales.find((item) => Number(item.id) === Number(cita.hospital_id))
        || estado.hospitales.find((item) => item.nombre === cita.hospital_nombre);
    if (hospital) {
        const { lat, lng } = obtenerCoordenadas(hospital);
        return urlGoogleMaps(lat, lng);
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cita.hospital_nombre || '')}`;
}

/**
 * Renderiza la tabla de historial de citas.
 * @returns {void}
 */
function renderCitas() {
    const tbody = document.getElementById('cuerpo-citas');
    const tabla = document.getElementById('citas-tabla-contenedor');
    const vacio = document.getElementById('citas-empty');
    const resumen = document.getElementById('resumen-citas');
    const usuario = estado.usuario;

    document.getElementById('caption-citas').textContent =
        `Historial de citas de ${usuario ? usuario.nombres : 'paciente'} (${estado.citas.length} registros)`;

    if (estado.citas.length === 0) {
        tbody.innerHTML = '';
        tabla.hidden = true;
        vacio.hidden = false;
        resumen.textContent = 'Aún no tiene citas registradas.';
        return;
    }

    vacio.hidden = true;
    tabla.hidden = false;

    tbody.innerHTML = estado.citas.map((cita) => {
        const activa = esCitaActiva(cita.estado);
        const acciones = activa
            ? `<button type="button" class="btn btn-secondary btn-small" data-accion="reprogramar" data-id="${cita.id}">Reprogramar</button>
               <button type="button" class="btn btn-danger btn-small" data-accion="cancelar" data-id="${cita.id}">Cancelar</button>`
            : cita.estado === 'ATENDIDA'
                ? `<button type="button" class="btn btn-primary btn-small" data-accion="diagnostico" data-id="${cita.id}">Ver diagnóstico</button>`
                : '<span class="help">Sin acciones disponibles</span>';

        return `
            <tr>
                <th scope="row">${escapeHtml(cita.codigo_atencion)}</th>
                <td>${escapeHtml(formatFecha(cita.fecha_cita))}<span class="choice-meta">${escapeHtml(cita.hora_cita)}</span></td>
                <td>${escapeHtml(cita.hospital_nombre)}<span class="choice-meta"><a href="${escapeHtml(urlMapaCita(cita))}" target="_blank" rel="noopener noreferrer">📍 Ver en Google Maps</a></span></td>
                <td>${escapeHtml(cita.especialidad_nombre)}</td>
                <td>${escapeHtml(cita.medico_nombre)}</td>
                <td>${htmlEstado(cita.estado)}</td>
                <td><div class="actions">${acciones}</div></td>
            </tr>
        `;
    }).join('');

    const activas = estado.citas.filter((cita) => esCitaActiva(cita.estado)).length;
    const atendidas = estado.citas.filter((cita) => cita.estado === 'ATENDIDA').length;
    resumen.textContent = `Tiene ${activas} cita(s) activa(s) y ${atendidas} atención(es) completada(s) en su historial.`;
}

/**
 * Carga el historial de citas del paciente.
 * @param {boolean} [anunciar=true] Si debe anunciar la actualización.
 * @returns {Promise<void>}
 */
async function cargarCitas(anunciar = true) {
    const cargando = document.getElementById('citas-loading');
    const tabla = document.getElementById('citas-tabla-contenedor');
    const vacio = document.getElementById('citas-empty');
    cargando.hidden = false;
    tabla.hidden = true;
    vacio.hidden = true;

    try {
        estado.citas = await getCitas();
        renderCitas();
        if (anunciar) {
            announce(`Historial actualizado. ${estado.citas.length} citas registradas.`, 'polite');
        }
    } catch (error) {
        mostrarAvisoHistorial(error.message || 'No se pudo cargar el historial de citas.', 'error');
        vacio.hidden = false;
    } finally {
        cargando.hidden = true;
    }
}

/**
 * Abre el diálogo con el diagnóstico de una cita atendida.
 * @param {Record<string, any>} cita Cita atendida.
 * @returns {Promise<void>}
 */
async function abrirDiagnostico(cita) {
    if (!cita) {
        return;
    }
    document.getElementById('diagnostico-resumen').textContent =
        `Cita ${cita.codigo_atencion} del ${formatFecha(cita.fecha_cita)} a las ${cita.hora_cita} con ${cita.medico_nombre} (${cita.especialidad_nombre}).`;
    const alerta = document.getElementById('diagnostico-alert');
    alerta.hidden = true;
    const contenedor = document.getElementById('diagnostico-contenido');
    contenedor.innerHTML = '<p class="loading-state"><span class="loading-spinner" aria-hidden="true"></span> Cargando diagnóstico…</p>';

    const dialogo = document.getElementById('dlg-diagnostico');
    if (!dialogo.open) {
        dialogo.showModal();
    }
    document.getElementById('titulo-dlg-diagnostico').focus();

    try {
        const diagnostico = await getDiagnosticoPorCita(cita.id);

        contenedor.innerHTML = `
            <dl class="summary-list">
                <div><dt>Código CIE-10</dt><dd>${escapeHtml(diagnostico.codigo_cie10)}</dd></div>
                <div><dt>Diagnóstico</dt><dd>${escapeHtml(diagnostico.descripcion)}</dd></div>
                <div><dt>Indicaciones generales</dt><dd>${escapeHtml(diagnostico.indicaciones_generales || 'Sin indicaciones adicionales.')}</dd></div>
            </dl>
        `;
        announce('Diagnóstico cargado.', 'polite');
    } catch (error) {
        contenedor.innerHTML = '';
        document.getElementById('diagnostico-alert-texto').textContent =
            error.message || 'No se pudo cargar el diagnóstico.';
        alerta.hidden = false;
        announce(document.getElementById('diagnostico-alert-texto').textContent, 'assertive');
    }
}

/**
 * Abre el diálogo de reprogramación y carga los horarios libres.
 * @param {Record<string, any>} cita Cita a reprogramar.
 * @returns {Promise<void>}
 */
async function abrirReprogramar(cita) {
    if (!cita) {
        return;
    }
    estado.citaReprogramar = cita;
    document.getElementById('reprogramar-cita-id').value = String(cita.id);
    document.getElementById('reprogramar-motivo').value = '';
    document.getElementById('reprogramar-resumen').textContent =
        `Cita ${cita.codigo_atencion}: ${cita.especialidad_nombre} en ${cita.hospital_nombre} el ${formatFecha(cita.fecha_cita)} a las ${cita.hora_cita}.`;
    document.getElementById('reprogramar-alert').hidden = true;

    const contenedor = document.getElementById('reprogramar-slots');
    contenedor.innerHTML = '<p class="loading-state"><span class="loading-spinner" aria-hidden="true"></span> Buscando horarios libres…</p>';

    const dialogo = document.getElementById('dlg-reprogramar');
    if (!dialogo.open) {
        dialogo.showModal();
    }
    document.getElementById('titulo-dlg-reprogramar').focus();

    try {
        const medicos = await getDoctores({
            hospitalId: cita.hospital_id,
            especialidadId: cita.especialidad_id
        });
        /** @type {Array<{ horario: Horario, medico: Medico }>} */
        const libres = [];
        medicos.forEach((medico) => {
            (medico.horarios || []).forEach((horario) => {
                if (horario.disponible && Number(horario.id) !== Number(cita.horario_id)) {
                    libres.push({ horario, medico });
                }
            });
        });

        if (libres.length === 0) {
            contenedor.innerHTML = '<p class="empty-state">No hay horarios libres en esta especialidad y hospital. Puede cancelar la cita y reservar en otra fecha.</p>';
            return;
        }

        contenedor.innerHTML = `
            <div class="choice-grid" role="radiogroup" aria-label="Nuevos horarios disponibles">
                ${libres.map(({ horario, medico }) => `
                    <label class="slot-card">
                        <input type="radio" name="nuevo-horario" value="${horario.id}">
                        <span>
                            <span class="slot-date">${escapeHtml(formatFecha(horario.dia))} · ${escapeHtml(horario.hora)}</span>
                            <span class="slot-time">${escapeHtml(medico.nombre)} (${escapeHtml(medico.cmp)})</span>
                        </span>
                    </label>
                `).join('')}
            </div>
        `;
        const primerRadio = contenedor.querySelector('input[type="radio"]');
        if (primerRadio) {
            primerRadio.focus();
        }
    } catch (error) {
        contenedor.innerHTML = '<p class="empty-state">No se pudieron cargar los horarios disponibles.</p>';
        document.getElementById('reprogramar-alert-texto').textContent =
            error.message || 'No se pudieron cargar los horarios disponibles.';
        document.getElementById('reprogramar-alert').hidden = false;
        announce(error.message || 'No se pudieron cargar los horarios disponibles.', 'assertive');
    }
}

/**
 * Abre el diálogo de cancelación.
 * @param {Record<string, any>} cita Cita a cancelar.
 * @returns {void}
 */
function abrirCancelar(cita) {
    if (!cita) {
        return;
    }
    estado.citaCancelar = cita;
    document.getElementById('cancelar-cita-id').value = String(cita.id);
    document.getElementById('cancelar-motivo').value = '';
    document.getElementById('cancelar-alert').hidden = true;
    document.getElementById('cancelar-resumen').textContent =
        `¿Desea cancelar la cita ${cita.codigo_atencion} del ${formatFecha(cita.fecha_cita)} a las ${cita.hora_cita} con ${cita.medico_nombre}? El cupo quedará libre para otro paciente.`;
    const dialogo = document.getElementById('dlg-cancelar');
    if (!dialogo.open) {
        dialogo.showModal();
    }
    document.getElementById('titulo-dlg-cancelar').focus();
}

/**
 * Envía el formulario de reprogramación.
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function enviarReprogramacion(event) {
    event.preventDefault();
    const cita = estado.citaReprogramar;
    if (!cita) {
        return;
    }
    const seleccionado = document.querySelector('input[name="nuevo-horario"]:checked');
    const alerta = document.getElementById('reprogramar-alert');
    const alertaTexto = document.getElementById('reprogramar-alert-texto');

    if (!seleccionado) {
        alertaTexto.textContent = 'Seleccione uno de los horarios libres para reprogramar su cita.';
        alerta.hidden = false;
        announce(alertaTexto.textContent, 'assertive');
        return;
    }

    const boton = document.getElementById('btn-confirmar-reprogramar');
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Guardando…';

    try {
        await reprogramarCita(cita.id, {
            nuevoHorarioId: Number(seleccionado.value),
            motivo: document.getElementById('reprogramar-motivo').value.trim()
        });
        document.getElementById('dlg-reprogramar').close();
        mostrarAvisoHistorial('Su cita fue reprogramada correctamente y el horario anterior quedó liberado.', 'success');
        await cargarCitas(false);
    } catch (error) {
        alertaTexto.textContent = error.message || 'No se pudo reprogramar la cita.';
        alerta.hidden = false;
        announce(alertaTexto.textContent, 'assertive');
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = 'Guardar nueva fecha';
    }
}

/**
 * Envía el formulario de cancelación.
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function enviarCancelacion(event) {
    event.preventDefault();
    const cita = estado.citaCancelar;
    if (!cita) {
        return;
    }

    const boton = document.getElementById('btn-confirmar-cancelar');
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Cancelando…';

    try {
        await cancelarCita(cita.id, document.getElementById('cancelar-motivo').value.trim());
        document.getElementById('dlg-cancelar').close();
        mostrarAvisoHistorial('La cita fue cancelada y el horario quedó disponible para otros pacientes.', 'success');
        await cargarCitas(false);
    } catch (error) {
        const alerta = document.getElementById('cancelar-alert');
        document.getElementById('cancelar-alert-texto').textContent = error.message || 'No se pudo cancelar la cita.';
        alerta.hidden = false;
        announce(document.getElementById('cancelar-alert-texto').textContent, 'assertive');
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = 'Confirmar cancelación';
    }
}

/**
 * Confirma la reserva y actualiza la interfaz con el código de atención.
 * @returns {Promise<void>}
 */
async function confirmarReserva() {
    const horario = estado.horario;
    if (!horario) {
        mostrarErrorConfirmacion('Seleccione un horario antes de confirmar la cita.');
        return;
    }

    const boton = document.getElementById('btn-confirmar');
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Reservando y bloqueando cupo…';
    mostrarErrorConfirmacion(null);

    try {
        const resultado = await reservarCita(horario.id);
        const cita = resultado.cita;
        document.getElementById('codigo-atencion').textContent = cita.codigo_atencion;
        document.getElementById('confirmacion-detalle').textContent =
            `${cita.especialidad_nombre} en ${cita.hospital_nombre} el ${formatFecha(cita.fecha_cita)} a las ${cita.hora_cita} con ${cita.medico_nombre}.`;
        irAPaso(5);
        announce(`Cita confirmada. Su código de atención es ${cita.codigo_atencion}.`, 'assertive');
        await cargarCitas(false);
        mostrarAvisoHistorial(`Cita ${cita.codigo_atencion} registrada correctamente.`, 'success');
    } catch (error) {
        mostrarErrorConfirmacion(error.message || 'No se pudo confirmar la cita.');
        if (error.status === 400) {
            announce('El horario pudo haber sido reservado por otra persona. Actualizando disponibilidad.', 'assertive');
            await cargarMedicos();
        }
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = 'Confirmar cita y bloquear cupo';
    }
}

/**
 * Reinicia el asistente de reserva y recarga la disponibilidad.
 * @returns {Promise<void>}
 */
async function nuevaReserva() {
    estado.hospital = null;
    estado.especialidad = null;
    estado.medicos = [];
    estado.horario = null;
    mostrarErrorReserva(null);
    mostrarErrorConfirmacion(null);
    document.getElementById('btn-paso-1-continuar').disabled = true;
    document.getElementById('btn-paso-2-continuar').disabled = true;
    document.getElementById('btn-paso-3-continuar').disabled = true;
    irAPaso(1);
    await cargarHospitales();
    announce('Puede iniciar una nueva reserva seleccionando un hospital.', 'polite');
}

/**
 * Conecta los eventos del asistente de reserva.
 * @returns {void}
 */
function conectarEventos() {
    const listaHospitales = document.getElementById('lista-hospitales');
    const listaEspecialidades = document.getElementById('lista-especialidades');
    const listaMedicos = document.getElementById('lista-medicos');

    function handleHospitalSelection(event) {
        const input = event.target.closest('input[name="hospital"]');
        if (!input) {
            return;
        }
        const hospital = estado.hospitales.find((item) => item.id === Number(input.value)) || null;
        estado.hospital = hospital;
        estado.especialidad = null;
        estado.medicos = [];
        estado.horario = null;
        marcarSeleccion(listaHospitales);
        document.getElementById('btn-paso-1-continuar').disabled = !hospital;
        document.getElementById('btn-paso-2-continuar').disabled = true;
        document.getElementById('btn-paso-3-continuar').disabled = true;
        if (hospital) {
            announce(`Hospital seleccionado: ${hospital.nombre}.`, 'polite');
            actualizarMapaHospital();
        }
    }

    function handleEspecialidadSelection(event) {
        const input = event.target.closest('input[name="especialidad"]');
        if (!input || !estado.hospital) {
            return;
        }
        const especialidad = estado.hospital.especialidades.find((item) => item.id === Number(input.value)) || null;
        estado.especialidad = especialidad;
        estado.medicos = [];
        estado.horario = null;
        marcarSeleccion(listaEspecialidades);
        document.getElementById('btn-paso-2-continuar').disabled = !especialidad;
        document.getElementById('btn-paso-3-continuar').disabled = true;
        if (especialidad) {
            announce(`Especialidad seleccionada: ${especialidad.nombre}.`, 'polite');
        }
    }

    function handleHorarioSelection(event) {
        const input = event.target.closest('input[name="horario"]');
        if (!input) {
            return;
        }
        const horarioId = Number(input.value);
        const medico = estado.medicos.find((item) => (item.horarios || []).some((hr) => Number(hr.id) === horarioId));
        const horario = medico ? (medico.horarios || []).find((hr) => Number(hr.id) === horarioId) : null;
        estado.horario = horario && medico ? { ...horario, medico } : null;
        document.querySelectorAll('#lista-medicos .slot-card').forEach((tarjeta) => {
            const radio = tarjeta.querySelector('input[type="radio"]');
            tarjeta.classList.toggle('is-selected', Boolean(radio && radio.checked));
        });
        document.getElementById('btn-paso-3-continuar').disabled = !estado.horario;
        if (estado.horario && medico) {
            announce(`Horario seleccionado: ${formatFecha(estado.horario.dia)} a las ${estado.horario.hora} con ${medico.nombre}.`, 'polite');
        }
    }

    // Delegación de eventos: click en la tarjeta (label) + change en el radio
    listaHospitales.addEventListener('click', (event) => {
        const label = event.target.closest('.choice-card');
        if (!label) return;
        const input = label.querySelector('input[name="hospital"]');
        if (input && !input.disabled) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    listaHospitales.addEventListener('change', handleHospitalSelection);

    listaEspecialidades.addEventListener('click', (event) => {
        const label = event.target.closest('.choice-card');
        if (!label) return;
        const input = label.querySelector('input[name="especialidad"]');
        if (input && !input.disabled) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    listaEspecialidades.addEventListener('change', handleEspecialidadSelection);

    listaMedicos.addEventListener('click', (event) => {
        const label = event.target.closest('.slot-card');
        if (!label) return;
        const input = label.querySelector('input[name="horario"]');
        if (input && !input.disabled) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    listaMedicos.addEventListener('change', handleHorarioSelection);

    document.getElementById('btn-paso-1-continuar').addEventListener('click', () => {
        if (!estado.hospital) {
            mostrarErrorReserva('Seleccione un hospital para continuar.');
            return;
        }
        mostrarErrorReserva(null);
        renderEspecialidades();
        irAPaso(2);
        announce('Seleccione una especialidad disponible en el hospital elegido.', 'polite');
    });

    document.getElementById('btn-paso-2-volver').addEventListener('click', () => {
        mostrarErrorReserva(null);
        irAPaso(1);
    });

    document.getElementById('btn-paso-2-continuar').addEventListener('click', async () => {
        if (!estado.especialidad) {
            mostrarErrorReserva('Seleccione una especialidad para continuar.');
            return;
        }
        mostrarErrorReserva(null);
        await cargarMedicos();
        irAPaso(3);
        announce('Seleccione un médico y un horario disponible.', 'polite');
    });

    document.getElementById('btn-paso-3-volver').addEventListener('click', () => {
        mostrarErrorReserva(null);
        irAPaso(2);
    });

    document.getElementById('btn-paso-3-continuar').addEventListener('click', () => {
        if (!estado.horario) {
            mostrarErrorReserva('Seleccione un horario disponible para continuar.');
            return;
        }
        mostrarErrorReserva(null);
        pintarResumen();
        irAPaso(4);
        announce('Revise los datos de su cita y confirme la reserva.', 'polite');
    });

    document.getElementById('btn-paso-4-volver').addEventListener('click', () => {
        mostrarErrorConfirmacion(null);
        irAPaso(3);
    });

    document.getElementById('btn-confirmar').addEventListener('click', confirmarReserva);
    document.getElementById('btn-nueva-reserva').addEventListener('click', nuevaReserva);
    document.getElementById('btn-recargar-citas').addEventListener('click', () => cargarCitas(true));

    document.getElementById('cuerpo-citas').addEventListener('click', (event) => {
        const boton = event.target.closest('button[data-accion]');
        if (!boton) {
            return;
        }
        const cita = estado.citas.find((item) => Number(item.id) === Number(boton.dataset.id));
        if (!cita) {
            return;
        }
        if (boton.dataset.accion === 'reprogramar') {
            abrirReprogramar(cita);
        } else if (boton.dataset.accion === 'cancelar') {
            abrirCancelar(cita);
        } else if (boton.dataset.accion === 'diagnostico') {
            abrirDiagnostico(cita);
        }
    });

    document.querySelectorAll('[data-cerrar-dialog]').forEach((boton) => {
        boton.addEventListener('click', () => {
            const dialogo = document.getElementById(boton.dataset.cerrarDialog);
            if (dialogo) {
                dialogo.close();
            }
        });
    });

    ['dlg-reprogramar', 'dlg-cancelar', 'dlg-diagnostico'].forEach((id) => {
        const dialogo = document.getElementById(id);
        dialogo.addEventListener('click', (event) => {
            if (event.target === dialogo) {
                dialogo.close();
            }
        });
    });

    document.getElementById('form-reprogramar').addEventListener('submit', enviarReprogramacion);
    document.getElementById('form-cancelar').addEventListener('submit', enviarCancelacion);

    document.getElementById('btn-logout').addEventListener('click', () => {
        announce('Cerrando sesión.', 'polite');
        logout();
    });
}

/**
 * Inicializa el portal del paciente.
 * @returns {Promise<void>}
 */
async function iniciar() {
    const usuario = requireRole(['PACIENTE']);
    if (!usuario) {
        return;
    }
    estado.usuario = usuario;
    initAccessibility();

    document.getElementById('chip-usuario').textContent = usuario.nombres;
    document.getElementById('nombre-paciente').textContent = usuario.nombres;

    conectarEventos();
    await Promise.all([
        cargarHospitales(),
        cargarCitas(false)
    ]);
    announce(`Portal del paciente cargado. Bienvenido, ${usuario.nombres}.`, 'polite');
}

iniciar();
