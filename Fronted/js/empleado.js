/**
 * @file Portal del personal asistencial: agenda, atención clínica y horarios.
 * @description Consume la API REST con JWT, restringe la vista al rol EMPLEADO,
 * permite registrar el resultado de cada cita y publicar bloques horarios para
 * que los pacientes reserven en línea.
 * @module empleado
 */

import {
    getSession,
    getCitas,
    getDoctores,
    getMedicamentos,
    crearHorario,
    registrarAtencion,
    crearDiagnostico,
    cancelarCita,
    logout
} from './services/apiClient.js';
import { initAccessibility, announce, escapeHtml } from './shared/accessibility.js';

const MAPA_ESTADOS = Object.freeze({
    RESERVADA: { clase: 'state--reservada', icono: '✔', texto: 'Reservada' },
    REPROGRAMADA: { clase: 'state--reprogramada', icono: '🔁', texto: 'Reprogramada' },
    ATENDIDA: { clase: 'state--atendida', icono: '🩺', texto: 'Atendida' },
    CANCELADA: { clase: 'state--cancelada', icono: '✖', texto: 'Cancelada' },
    INASISTENCIA: { clase: 'state--inasistencia', icono: '⚠', texto: 'Inasistencia' }
});

/**
 * Estado local del portal del personal.
 * @type {{
 *   usuario: Record<string, any> | null,
 *   citas: Array<Record<string, any>>,
 *   filtros: { estado: string, fecha: string },
 *   horarios: Array<Record<string, any>>,
 *   medico: Record<string, any> | null,
 *   citaAtencion: Record<string, any> | null,
 *   citaCancelar: Record<string, any> | null,
 *   medicamentos: Array<Record<string, any>>
 * }}
 */
const estado = {
    usuario: null,
    citas: [],
    filtros: { estado: '', fecha: '' },
    horarios: [],
    medico: null,
    citaAtencion: null,
    citaCancelar: null,
    medicamentos: []
};

/**
 * Indica si una cita admite acciones clínicas.
 * @param {string} estadoCita Estado de la cita.
 * @returns {boolean} `true` si está activa.
 */
function esCitaActiva(estadoCita) {
    return estadoCita === 'RESERVADA' || estadoCita === 'REPROGRAMADA';
}

/**
 * Formatea una fecha ISO `YYYY-MM-DD` en español peruano.
 * @param {string} valor Fecha ISO corta.
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
 * Convierte una hora `HH:MM` al formato de 12 horas usado por la agenda.
 * @param {string} valor Hora en formato de 24 horas.
 * @returns {string} Hora en formato `hh:mm AM/PM`.
 */
function formatoHora12(valor) {
    const [horas, minutos] = String(valor).split(':').map(Number);
    if (Number.isNaN(horas) || Number.isNaN(minutos)) {
        return String(valor);
    }
    const periodo = horas >= 12 ? 'PM' : 'AM';
    const hora12 = horas % 12 === 0 ? 12 : horas % 12;
    return `${String(hora12).padStart(2, '0')}:${String(minutos).padStart(2, '0')} ${periodo}`;
}

/**
 * Devuelve el HTML accesible de una insignia de estado.
 * @param {string} estadoCita Estado de la cita.
 * @returns {string} HTML seguro.
 */
function htmlEstado(estadoCita) {
    const meta = MAPA_ESTADOS[estadoCita] || { clase: 'state--neutral', icono: '•', texto: estadoCita };
    return `<span class="state ${meta.clase}"><span class="state-icon" aria-hidden="true">${meta.icono}</span>${escapeHtml(meta.texto)}</span>`;
}

/**
 * Muestra un aviso en la sección de agenda.
 * @param {string} mensaje Texto del aviso.
 * @param {'info'|'success'|'error'} [tipo='info'] Tipo visual.
 * @returns {void}
 */
function mostrarAvisoAgenda(mensaje, tipo = 'info') {
    const contenedor = document.getElementById('agenda-alert');
    const texto = document.getElementById('agenda-alert-texto');
    contenedor.className = `alert alert-${tipo === 'error' ? 'error' : tipo}`;
    texto.textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, tipo === 'error' ? 'assertive' : 'polite');
}

/**
 * Muestra un aviso en la sección de horarios.
 * @param {string} mensaje Texto del aviso.
 * @param {'info'|'success'|'error'|'warning'} [tipo='info'] Tipo visual.
 * @returns {void}
 */
function mostrarAvisoHorarios(mensaje, tipo = 'info') {
    const contenedor = document.getElementById('horarios-alert');
    const texto = document.getElementById('horarios-alert-texto');
    contenedor.className = `alert alert-${tipo === 'error' ? 'error' : tipo}`;
    texto.textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, tipo === 'error' ? 'assertive' : 'polite');
}

/**
 * Filtra las citas según estado y fecha seleccionados.
 * @returns {Array<Record<string, any>>} Citas filtradas.
 */
function citasFiltradas() {
    return estado.citas.filter((cita) => {
        const coincideEstado = !estado.filtros.estado || cita.estado === estado.filtros.estado;
        const coincideFecha = !estado.filtros.fecha || String(cita.fecha_cita).slice(0, 10) === estado.filtros.fecha;
        return coincideEstado && coincideFecha;
    });
}

/**
 * Actualiza los indicadores y el resumen de la agenda.
 * @returns {void}
 */
function actualizarResumen() {
    const total = estado.citas.length;
    const activas = estado.citas.filter((cita) => esCitaActiva(cita.estado)).length;
    const atendidas = estado.citas.filter((cita) => cita.estado === 'ATENDIDA').length;
    const inasistencias = estado.citas.filter((cita) => cita.estado === 'INASISTENCIA').length;

    document.getElementById('kpi-asignadas').textContent = String(total);
    document.getElementById('kpi-activas').textContent = String(activas);
    document.getElementById('kpi-atendidas').textContent = String(atendidas);
    document.getElementById('kpi-inasistencias').textContent = String(inasistencias);

    document.getElementById('resumen-agenda').textContent = total === 0
        ? 'Usted aún no tiene citas asignadas en su agenda médica.'
        : `Su agenda registra ${total} cita(s): ${activas} activa(s), ${atendidas} atendida(s) y ${inasistencias} inasistencia(s).`;
}

/**
 * Renderiza la tabla de citas con los filtros aplicados.
 * @returns {void}
 */
function renderAgenda() {
    const citas = citasFiltradas();
    const contenedor = document.getElementById('agenda-tabla-contenedor');
    const vacio = document.getElementById('agenda-empty');
    const cuerpo = document.getElementById('cuerpo-agenda');
    const usuario = estado.usuario;

    document.getElementById('caption-agenda').textContent =
        `Agenda de ${usuario ? usuario.nombres : 'personal asistencial'} (${citas.length} citas visibles)`;

    if (citas.length === 0) {
        cuerpo.innerHTML = '';
        contenedor.hidden = true;
        vacio.hidden = false;
        vacio.textContent = estado.citas.length === 0
            ? 'No tiene citas asignadas todavía. Publique horarios para que los pacientes puedan reservar.'
            : 'No hay citas que coincidan con los filtros seleccionados.';
        return;
    }

    vacio.hidden = true;
    contenedor.hidden = false;

    cuerpo.innerHTML = citas.map((cita) => {
        const acciones = esCitaActiva(cita.estado)
            ? `<button type="button" class="btn btn-primary btn-small" data-accion="atender" data-id="${cita.id}">Registrar atención</button>
               <button type="button" class="btn btn-danger btn-small" data-accion="cancelar" data-id="${cita.id}">Cancelar</button>`
            : '<span class="help">Sin acciones pendientes</span>';

        return `
            <tr>
                <th scope="row">${escapeHtml(cita.codigo_atencion)}</th>
                <td>${escapeHtml(formatFecha(cita.fecha_cita))}<span class="choice-meta">${escapeHtml(cita.hora_cita)}</span></td>
                <td>${escapeHtml(cita.nombre_paciente)}<span class="choice-meta">DNI ${escapeHtml(cita.dni_paciente)}</span></td>
                <td>${escapeHtml(cita.hospital_nombre)}</td>
                <td>${escapeHtml(cita.especialidad_nombre)}</td>
                <td>${htmlEstado(cita.estado)}</td>
                <td><div class="actions">${acciones}</div></td>
            </tr>
        `;
    }).join('');
}

/**
 * Carga las citas de la agenda médica.
 * @param {boolean} [anunciar=true] Si debe anunciar el resultado.
 * @returns {Promise<void>}
 */
async function cargarAgenda(anunciar = true) {
    const cargando = document.getElementById('agenda-loading');
    const contenedor = document.getElementById('agenda-tabla-contenedor');
    const vacio = document.getElementById('agenda-empty');
    cargando.hidden = false;
    contenedor.hidden = true;
    vacio.hidden = true;

    try {
        estado.citas = await getCitas();
        actualizarResumen();
        renderAgenda();
        if (anunciar) {
            announce(`Agenda actualizada. ${estado.citas.length} citas asignadas.`, 'polite');
        }
    } catch (error) {
        mostrarAvisoAgenda(error.message || 'No se pudo cargar la agenda médica.', 'error');
        vacio.hidden = false;
    } finally {
        cargando.hidden = true;
    }
}

/**
 * Renderiza la tabla de bloques horarios del profesional.
 * @returns {void}
 */
function renderHorarios() {
    const contenedor = document.getElementById('horarios-tabla-contenedor');
    const vacio = document.getElementById('horarios-empty');
    const cuerpo = document.getElementById('cuerpo-horarios');
    const medico = estado.medico;

    document.getElementById('caption-horarios').textContent = medico
        ? `Bloques horarios de ${medico.nombre} (${estado.horarios.length} registros)`
        : 'Bloques horarios publicados';

    if (!medico) {
        cuerpo.innerHTML = '';
        contenedor.hidden = true;
        vacio.hidden = false;
        vacio.textContent = 'Su cuenta no está vinculada a un médico. Solicite al administrador que asocie su usuario a un profesional para publicar horarios.';
        return;
    }

    if (estado.horarios.length === 0) {
        cuerpo.innerHTML = '';
        contenedor.hidden = true;
        vacio.hidden = false;
        vacio.textContent = 'No tiene bloques horarios publicados todavía. Use el formulario para habilitar su primer turno.';
        return;
    }

    vacio.hidden = true;
    contenedor.hidden = false;

    const ordenados = [...estado.horarios].sort((a, b) => {
        const fechaA = String(a.dia || '');
        const fechaB = String(b.dia || '');
        if (fechaA !== fechaB) {
            return fechaA.localeCompare(fechaB);
        }
        return String(a.hora || '').localeCompare(String(b.hora || ''));
    });

    cuerpo.innerHTML = ordenados.map((horario) => {
        const disponible = Boolean(horario.disponible);
        const estadoHtml = disponible
            ? '<span class="state state--atendida"><span class="state-icon" aria-hidden="true">✔</span>Disponible</span>'
            : '<span class="state state--cancelada"><span class="state-icon" aria-hidden="true">●</span>Ocupado</span>';
        return `
            <tr>
                <th scope="row">${escapeHtml(formatFecha(horario.dia))}</th>
                <td>${escapeHtml(horario.hora)}</td>
                <td>${estadoHtml}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Carga los bloques horarios del médico vinculado a la cuenta.
 * @param {boolean} [anunciar=true] Si debe anunciar el resultado.
 * @returns {Promise<void>}
 */
async function cargarHorarios(anunciar = true) {
    const cargando = document.getElementById('horarios-loading');
    const contenedor = document.getElementById('horarios-tabla-contenedor');
    const vacio = document.getElementById('horarios-empty');
    cargando.hidden = false;
    contenedor.hidden = true;
    vacio.hidden = true;

    try {
        const doctores = await getDoctores();
        const medicoId = estado.usuario ? Number(estado.usuario.medicoId) : NaN;
        estado.medico = doctores.find((doctor) => Number(doctor.id) === medicoId) || null;
        estado.horarios = estado.medico && Array.isArray(estado.medico.horarios) ? estado.medico.horarios : [];
        renderHorarios();
        if (anunciar) {
            announce(`Horarios actualizados. ${estado.horarios.length} bloques registrados.`, 'polite');
        }
    } catch (error) {
        mostrarAvisoHorarios(error.message || 'No se pudieron cargar sus bloques horarios.', 'error');
        vacio.hidden = false;
    } finally {
        cargando.hidden = true;
    }
}

/**
 * Muestra u oculta los bloques del formulario de atención según el resultado elegido.
 * @returns {void}
 */
function actualizarBloquesAtencion() {
    const seleccionado = document.querySelector('input[name="resultado-atencion"]:checked');
    const esAtendida = Boolean(seleccionado && seleccionado.value === 'ATENDIDA');
    document.getElementById('bloque-diagnostico').hidden = !esAtendida;
    document.getElementById('bloque-observacion').hidden = esAtendida;
}

/**
 * Construye las opciones del selector de medicamentos.
 * @param {number|string} [seleccionado] Identificador preseleccionado.
 * @returns {string} HTML de las opciones.
 */
function opcionesMedicamentos(seleccionado) {
    const cabecera = '<option value="">Seleccione un medicamento…</option>';
    const opciones = estado.medicamentos.map((medicamento) => {
        const valor = Number(medicamento.id);
        const etiqueta = `${medicamento.nombre} ${medicamento.concentracion} (${medicamento.presentacion})`;
        const marcado = Number(seleccionado) === valor ? ' selected' : '';
        return `<option value="${valor}"${marcado}>${escapeHtml(etiqueta)}</option>`;
    }).join('');
    return cabecera + opciones;
}

/**
 * Añade una fila de medicamento a la receta del diagnóstico.
 * @returns {void}
 */
function agregarFilaReceta() {
    const contenedor = document.getElementById('receta-items');
    if (estado.medicamentos.length === 0) {
        mostrarAvisoAtencion('No hay medicamentos disponibles en el catálogo para prescribir.', 'error');
        return;
    }
    const seq = `${Date.now()}-${contenedor.children.length}`;
    const fila = document.createElement('div');
    fila.className = 'receta-row';
    fila.setAttribute('data-receta-row', '');
    fila.innerHTML = `
        <div class="field">
            <label for="receta-med-${seq}">Medicamento</label>
            <select class="form-control" id="receta-med-${seq}" data-campo="medicamentoId">${opcionesMedicamentos()}</select>
        </div>
        <div class="field">
            <label for="receta-dosis-${seq}">Dosis</label>
            <input class="form-control" type="text" id="receta-dosis-${seq}" data-campo="dosis" maxlength="60" placeholder="Ej. 1 tableta">
        </div>
        <div class="field">
            <label for="receta-frec-${seq}">Frecuencia</label>
            <input class="form-control" type="text" id="receta-frec-${seq}" data-campo="frecuencia" maxlength="60" placeholder="Ej. Cada 8 horas">
        </div>
        <div class="field">
            <label for="receta-dias-${seq}">Días</label>
            <input class="form-control" type="number" id="receta-dias-${seq}" data-campo="dias" min="1" max="365" value="1">
        </div>
        <button type="button" class="btn btn-danger btn-small" data-quitar-receta aria-label="Quitar medicamento recetado">Quitar</button>
    `;
    contenedor.appendChild(fila);
    const selector = fila.querySelector('select');
    if (selector) {
        selector.focus();
    }
}

/**
 * Limpia las filas de la receta.
 * @returns {void}
 */
function limpiarReceta() {
    const contenedor = document.getElementById('receta-items');
    if (contenedor) {
        contenedor.innerHTML = '';
    }
}

/**
 * Lee y valida las filas de la receta del formulario de atención.
 * @returns {Array<{ medicamentoId: number, dosis: string, frecuencia: string, dias: number }>} Medicamentos recetados.
 * @throws {Error} Si una fila está incompleta.
 */
function leerReceta() {
    const filas = Array.from(document.querySelectorAll('[data-receta-row]'));
    const medicamentos = [];
    for (const fila of filas) {
        const medicamentoId = Number(fila.querySelector('[data-campo="medicamentoId"]').value);
        const dosis = fila.querySelector('[data-campo="dosis"]').value.trim();
        const frecuencia = fila.querySelector('[data-campo="frecuencia"]').value.trim();
        const dias = Number(fila.querySelector('[data-campo="dias"]').value);
        if (!medicamentoId) {
            throw new Error('Seleccione el medicamento en cada fila de la receta o quítela.');
        }
        if (!dosis || !frecuencia) {
            throw new Error('Indique la dosis y la frecuencia de cada medicamento recetado.');
        }
        if (!Number.isInteger(dias) || dias <= 0) {
            throw new Error('Los días de tratamiento deben ser un número entero mayor que cero.');
        }
        medicamentos.push({ medicamentoId, dosis, frecuencia, dias });
    }
    return medicamentos;
}

/**
 * Muestra un aviso dentro del diálogo de atención.
 * @param {string} mensaje Texto del aviso.
 * @param {'info'|'error'} [tipo='info'] Tipo visual.
 * @returns {void}
 */
function mostrarAvisoAtencion(mensaje, tipo = 'info') {
    const alerta = document.getElementById('atencion-alert');
    document.getElementById('atencion-alert-texto').textContent = mensaje;
    alerta.className = `alert alert-${tipo === 'error' ? 'error' : 'info'}`;
    alerta.hidden = false;
    announce(mensaje, tipo === 'error' ? 'assertive' : 'polite');
}

/**
 * Abre el diálogo para registrar el resultado de una cita.
 * @param {Record<string, any>} cita Cita seleccionada.
 * @returns {void}
 */
function abrirAtencion(cita) {
    if (!cita) {
        return;
    }
    estado.citaAtencion = cita;
    document.getElementById('atencion-cita-id').value = String(cita.id);
    document.getElementById('atencion-resumen').textContent =
        `Cita ${cita.codigo_atencion}: paciente ${cita.nombre_paciente} (DNI ${cita.dni_paciente}), ${formatFecha(cita.fecha_cita)} a las ${cita.hora_cita}.`;
    document.getElementById('atencion-observacion').value = '';
    document.getElementById('atencion-cie10').value = '';
    document.getElementById('atencion-descripcion').value = '';
    document.getElementById('atencion-indicaciones').value = '';
    limpiarReceta();
    document.querySelectorAll('input[name="resultado-atencion"]').forEach((radio) => {
        radio.checked = false;
    });
    document.getElementById('atencion-alert').hidden = true;
    actualizarBloquesAtencion();

    const dialogo = document.getElementById('dlg-atencion');
    if (!dialogo.open) {
        dialogo.showModal();
    }
    document.getElementById('titulo-dlg-atencion').focus();
}

/**
 * Abre el diálogo de cancelación de una cita de la agenda.
 * @param {Record<string, any>} cita Cita seleccionada.
 * @returns {void}
 */
function abrirCancelar(cita) {
    if (!cita) {
        return;
    }
    estado.citaCancelar = cita;
    document.getElementById('cancelar-agenda-cita-id').value = String(cita.id);
    document.getElementById('cancelar-agenda-motivo').value = '';
    document.getElementById('cancelar-agenda-resumen').textContent =
        `¿Desea cancelar la cita ${cita.codigo_atencion} del ${formatFecha(cita.fecha_cita)} a las ${cita.hora_cita} con el paciente ${cita.nombre_paciente}? El cupo quedará libre.`;
    document.getElementById('cancelar-agenda-alert').hidden = true;

    const dialogo = document.getElementById('dlg-cancelar-agenda');
    if (!dialogo.open) {
        dialogo.showModal();
    }
    document.getElementById('titulo-dlg-cancelar-agenda').focus();
}

/**
 * Guarda el resultado clínico de la cita.
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function enviarAtencion(event) {
    event.preventDefault();
    const cita = estado.citaAtencion;
    if (!cita) {
        return;
    }
    const seleccionado = document.querySelector('input[name="resultado-atencion"]:checked');
    const alerta = document.getElementById('atencion-alert');
    const alertaTexto = document.getElementById('atencion-alert-texto');

    if (!seleccionado) {
        alertaTexto.textContent = 'Seleccione si la atención fue completada o si el paciente no asistió.';
        alerta.hidden = false;
        announce(alertaTexto.textContent, 'assertive');
        return;
    }

    const esAtendida = seleccionado.value === 'ATENDIDA';
    const codigoCie10 = document.getElementById('atencion-cie10').value.trim();
    const descripcion = document.getElementById('atencion-descripcion').value.trim();
    const indicaciones = document.getElementById('atencion-indicaciones').value.trim();
    let receta = [];

    if (esAtendida) {
        if (codigoCie10.length < 2) {
            alertaTexto.textContent = 'Ingrese el código CIE-10 del diagnóstico.';
            alerta.hidden = false;
            announce(alertaTexto.textContent, 'assertive');
            document.getElementById('atencion-cie10').focus();
            return;
        }
        if (descripcion.length < 5) {
            alertaTexto.textContent = 'Ingrese el diagnóstico clínico (mínimo 5 caracteres).';
            alerta.hidden = false;
            announce(alertaTexto.textContent, 'assertive');
            document.getElementById('atencion-descripcion').focus();
            return;
        }
        try {
            receta = leerReceta();
        } catch (error) {
            alertaTexto.textContent = error.message;
            alerta.hidden = false;
            announce(alertaTexto.textContent, 'assertive');
            return;
        }
    }

    const boton = document.getElementById('btn-confirmar-atencion');
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Guardando…';

    try {
        if (esAtendida) {
            await crearDiagnostico({
                citaId: cita.id,
                codigoCie10,
                descripcion,
                indicacionesGenerales: indicaciones || undefined,
                medicamentos: receta
            });
            document.getElementById('dlg-atencion').close();
            mostrarAvisoAgenda(
                `La cita ${cita.codigo_atencion} quedó atendida con diagnóstico y receta registrados.`,
                'success'
            );
        } else {
            await registrarAtencion(
                cita.id,
                seleccionado.value,
                document.getElementById('atencion-observacion').value.trim()
            );
            document.getElementById('dlg-atencion').close();
            mostrarAvisoAgenda(
                `La cita ${cita.codigo_atencion} quedó registrada como inasistencia.`,
                'success'
            );
        }
        await cargarAgenda(false);
    } catch (error) {
        alertaTexto.textContent = error.message || 'No se pudo registrar el resultado de la atención.';
        alerta.hidden = false;
        announce(alertaTexto.textContent, 'assertive');
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = 'Guardar resultado';
    }
}

/**
 * Cancela una cita de la agenda.
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function enviarCancelacion(event) {
    event.preventDefault();
    const cita = estado.citaCancelar;
    if (!cita) {
        return;
    }

    const boton = document.getElementById('btn-confirmar-cancelar-agenda');
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Cancelando…';

    try {
        await cancelarCita(cita.id, document.getElementById('cancelar-agenda-motivo').value.trim());
        document.getElementById('dlg-cancelar-agenda').close();
        mostrarAvisoAgenda(`La cita ${cita.codigo_atencion} fue cancelada y el horario quedó libre.`, 'success');
        await cargarAgenda(false);
    } catch (error) {
        document.getElementById('cancelar-agenda-alert-texto').textContent =
            error.message || 'No se pudo cancelar la cita.';
        document.getElementById('cancelar-agenda-alert').hidden = false;
        announce(document.getElementById('cancelar-agenda-alert-texto').textContent, 'assertive');
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = 'Confirmar cancelación';
    }
}

/**
 * Publica un nuevo bloque horario para el médico autenticado.
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function publicarHorario(event) {
    event.preventDefault();
    const fecha = document.getElementById('fecha-horario');
    const hora = document.getElementById('hora-horario');
    const boton = document.getElementById('btn-publicar-horario');

    if (!estado.medico) {
        mostrarAvisoHorarios('Su cuenta no está vinculada a un médico; no es posible publicar horarios.', 'error');
        return;
    }
    if (!fecha.value || !hora.value) {
        mostrarAvisoHorarios('Seleccione la fecha y la hora del nuevo bloque horario.', 'error');
        (fecha.value ? hora : fecha).focus();
        return;
    }

    const hoy = new Date();
    const fechaElegida = new Date(`${fecha.value}T00:00:00`);
    const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (Number.isNaN(fechaElegida.getTime()) || fechaElegida < hoySinHora) {
        mostrarAvisoHorarios('La fecha del bloque debe ser hoy o una fecha futura.', 'error');
        fecha.focus();
        return;
    }

    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Publicando…';

    try {
        const hora12 = formatoHora12(hora.value);
        await crearHorario({ fecha: fecha.value, hora: hora12 });
        mostrarAvisoHorarios(
            `Bloque horario publicado para el ${formatFecha(fecha.value)} a las ${hora12}.`,
            'success'
        );
        fecha.value = '';
        hora.value = '';
        await cargarHorarios(false);
    } catch (error) {
        mostrarAvisoHorarios(error.message || 'No se pudo publicar el bloque horario.', 'error');
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = 'Publicar bloque horario';
    }
}

/**
 * Conecta los eventos de la vista.
 * @returns {void}
 */
function conectarEventos() {
    document.getElementById('btn-recargar-agenda').addEventListener('click', () => cargarAgenda(true));
    document.getElementById('btn-recargar-horarios').addEventListener('click', () => cargarHorarios(true));

    document.getElementById('filtro-estado').addEventListener('change', (event) => {
        estado.filtros.estado = event.target.value;
        renderAgenda();
        announce(`Filtro de estado aplicado. ${citasFiltradas().length} citas visibles.`, 'polite');
    });

    document.getElementById('filtro-fecha').addEventListener('change', (event) => {
        estado.filtros.fecha = event.target.value;
        renderAgenda();
        announce(`Filtro de fecha aplicado. ${citasFiltradas().length} citas visibles.`, 'polite');
    });

    document.getElementById('btn-limpiar-filtros').addEventListener('click', () => {
        estado.filtros = { estado: '', fecha: '' };
        document.getElementById('filtro-estado').value = '';
        document.getElementById('filtro-fecha').value = '';
        renderAgenda();
        announce('Filtros de la agenda restablecidos.', 'polite');
    });

    document.getElementById('cuerpo-agenda').addEventListener('click', (event) => {
        const boton = event.target.closest('button[data-accion]');
        if (!boton) {
            return;
        }
        const cita = estado.citas.find((item) => Number(item.id) === Number(boton.dataset.id));
        if (!cita) {
            return;
        }
        if (boton.dataset.accion === 'atender') {
            abrirAtencion(cita);
        } else if (boton.dataset.accion === 'cancelar') {
            abrirCancelar(cita);
        }
    });

    document.getElementById('form-horario').addEventListener('submit', publicarHorario);
    document.getElementById('form-atencion').addEventListener('submit', enviarAtencion);
    document.getElementById('form-cancelar-agenda').addEventListener('submit', enviarCancelacion);

    document.querySelectorAll('input[name="resultado-atencion"]').forEach((radio) => {
        radio.addEventListener('change', actualizarBloquesAtencion);
    });

    document.getElementById('btn-agregar-medicamento').addEventListener('click', agregarFilaReceta);

    document.getElementById('receta-items').addEventListener('click', (event) => {
        const boton = event.target.closest('[data-quitar-receta]');
        if (boton) {
            const fila = boton.closest('[data-receta-row]');
            if (fila) {
                fila.remove();
                announce('Medicamento quitado de la receta.', 'polite');
            }
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

    ['dlg-atencion', 'dlg-cancelar-agenda'].forEach((id) => {
        const dialogo = document.getElementById(id);
        dialogo.addEventListener('click', (event) => {
            if (event.target === dialogo) {
                dialogo.close();
            }
        });
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        announce('Cerrando sesión.', 'polite');
        logout();
    });
}

/**
 * Carga el catálogo de medicamentos disponibles para prescribir.
 * @returns {Promise<void>}
 */
async function cargarMedicamentos() {
    const boton = document.getElementById('btn-agregar-medicamento');
    try {
        const medicamentos = await getMedicamentos();
        estado.medicamentos = Array.isArray(medicamentos) ? medicamentos : [];
        if (boton) {
            boton.disabled = estado.medicamentos.length === 0;
        }
    } catch (error) {
        estado.medicamentos = [];
        if (boton) {
            boton.disabled = true;
        }
        announce(`No se pudo cargar el catálogo de medicamentos: ${error.message || 'error de red'}.`, 'polite');
    }
}

/**
 * Guardia de ruta estricta para el portal del personal asistencial.
 * @returns {Record<string, any> | null} Usuario EMPLEADO o `null` si redirigió.
 */
function obtenerUsuarioEmpleado() {
    const sesion = getSession();
    const usuario = sesion ? sesion.usuario : null;
    if (!sesion || !sesion.token || !usuario || usuario.rol !== 'EMPLEADO') {
        localStorage.removeItem('minsa_session');
        window.location.replace('login.html');
        return null;
    }
    return usuario;
}

/**
 * Inicializa el portal del personal asistencial.
 * @returns {Promise<void>}
 */
async function iniciar() {
    const usuario = obtenerUsuarioEmpleado();
    if (!usuario) {
        return;
    }
    estado.usuario = usuario;
    initAccessibility();

    document.getElementById('chip-usuario').textContent = usuario.nombres;
    document.getElementById('nombre-empleado').textContent = usuario.nombres;

    conectarEventos();

    if (!usuario.medicoId) {
        document.getElementById('btn-publicar-horario').disabled = true;
        document.getElementById('fecha-horario').disabled = true;
        document.getElementById('hora-horario').disabled = true;
        mostrarAvisoHorarios(
            'Su cuenta no está vinculada a un médico. Un administrador debe asociarla para habilitar la publicación de horarios.',
            'warning'
        );
    }

    await Promise.all([
        cargarAgenda(false),
        cargarHorarios(false),
        cargarMedicamentos()
    ]);
    announce(`Portal del personal cargado. Bienvenido, ${usuario.nombres}.`, 'polite');
}

iniciar();
