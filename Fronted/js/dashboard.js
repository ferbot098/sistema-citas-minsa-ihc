/**
 * @file Dashboard administrativo del Sistema Inclusivo de Citas Médicas MINSA.
 * @description Consume los indicadores, citas, usuarios, hospitales, medicamentos y horarios
 * desde la API REST. Incluye guardia de rol ADMIN, navegación por pestañas accesibles
 * (WCAG 2.1 AA/AAA) y sincronización con Chart.js.
 * @module dashboard
 */

import {
    requireRole,
    getIndicadores,
    getCitas,
    getHospitales,
    getDoctores,
    listarUsuarios,
    crearStaff,
    crearHospital,
    getMedicamentos,
    crearMedicamento,
    cancelarCita,
    crearHorario,
    logout
} from './services/apiClient.js';
import { initAccessibility, announce, escapeHtml } from './shared/accessibility.js';

// ---- Guardia de ruta estricta ----
(function validarAccesoAdmin() {
    const usuario = requireRole(['ADMIN']);
    if (!usuario) {
        throw new Error('Acceso denegado: se requiere rol ADMIN.');
    }
})();

// ---- Gestor de pestañas del dashboard ----
const TAB_IDS = ['indicadores', 'citas', 'personal', 'lugares', 'medicamentos', 'horarios'];

/**
 * Inicializa la navegación accesible por pestañas (tablist / tabpanel).
 * @returns {void}
 */
function initDashboardTabs() {
    const tabbar = document.querySelector('.dashboard-tabbar');
    if (!tabbar) return;

    const tabs = Array.from(tabbar.querySelectorAll('.dashboard-tab'));
    const panels = TAB_IDS
        .map((id) => document.getElementById(`panel-${id}`))
        .filter(Boolean);

    if (tabs.length === 0) return;

    /**
     * Activa una pestaña y muestra su panel asociado.
     * @param {HTMLButtonElement} tab Pestaña seleccionada.
     * @param {boolean} [enfocar=true] Si debe mover el foco al panel.
     * @returns {void}
     */
    function activateTab(tab, enfocar = true) {
        const targetId = tab.getAttribute('aria-controls');
        tabs.forEach((t) => {
            const isActive = t === tab;
            t.setAttribute('aria-selected', String(isActive));
            t.tabIndex = isActive ? 0 : -1;
        });
        panels.forEach((panel) => {
            const isActive = panel.id === targetId;
            panel.hidden = !isActive;
            panel.classList.toggle('is-active', isActive);
        });
        if (enfocar) {
            const target = document.getElementById(targetId);
            if (target) {
                target.focus({ preventScroll: true });
            }
            announce(`Sección ${tab.textContent.trim()} cargada.`, 'polite');
        }
    }

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => activateTab(tab, true));
        tab.addEventListener('keydown', (event) => {
            const current = tabs.indexOf(tab);
            let next;
            switch (event.key) {
                case 'ArrowLeft':
                    next = (current - 1 + tabs.length) % tabs.length;
                    break;
                case 'ArrowRight':
                    next = (current + 1) % tabs.length;
                    break;
                case 'Home':
                    next = 0;
                    break;
                case 'End':
                    next = tabs.length - 1;
                    break;
                default:
                    return;
            }
            event.preventDefault();
            tabs[next].focus();
            activateTab(tabs[next], false);
        });
    });

    activateTab(tabs[0], false);
}

const MAPA_ESTADOS = Object.freeze({
    RESERVADA: { clase: 'state--reservada', icono: '✔', texto: 'Reservada' },
    REPROGRAMADA: { clase: 'state--reprogramada', icono: '🔁', texto: 'Reprogramada' },
    ATENDIDA: { clase: 'state--atendida', icono: '🩺', texto: 'Atendida' },
    CANCELADA: { clase: 'state--cancelada', icono: '✖', texto: 'Cancelada' },
    INASISTENCIA: { clase: 'state--inasistencia', icono: '⚠', texto: 'Inasistencia' }
});

const ROLES_LABELS = Object.freeze({
    PACIENTE: 'Paciente',
    EMPLEADO: 'Personal asistencial',
    ADMIN: 'Administrador'
});

const estado = {
    usuario: null,
    indicadores: null,
    citas: [],
    usuarios: [],
    doctores: [],
    especialidades: [],
    especialidadesCatalogo: [],
    hospitales: [],
    medicamentos: [],
    horariosAdmin: [],
    filtros: { periodo: '', especialidad: '' },
    charts: {},
    citaCancelar: null
};

/**
 * Indica si una cita admite cancelación.
 * @param {string} estadoCita Estado de la cita.
 * @returns {boolean} `true` si está activa.
 */
function esCitaActiva(estadoCita) {
    return estadoCita === 'RESERVADA' || estadoCita === 'REPROGRAMADA';
}

/**
 * Comprueba si el usuario prefiere movimiento reducido.
 * @returns {boolean} `true` si debe evitarse la animación.
 */
function prefiereMovimientoReducido() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Formatea una fecha ISO `YYYY-MM-DD` en español peruano.
 * @param {string} valor Fecha ISO corta.
 * @returns {string} Fecha legible.
 */
function formatFecha(valor) {
    if (!valor) return '—';
    const partes = String(valor).slice(0, 10).split('-').map(Number);
    if (partes.length !== 3 || partes.some((n) => Number.isNaN(n))) return String(valor);
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
 * Formatea un periodo `YYYY-MM` con nombre de mes y año.
 * @param {string} valor Periodo ISO.
 * @returns {string} Periodo legible.
 */
function formatPeriodo(valor) {
    const [anio, mes] = String(valor).split('-').map(Number);
    if (!anio || !mes) return String(valor);
    try {
        const texto = new Intl.DateTimeFormat('es-PE', {
            month: 'long',
            year: 'numeric'
        }).format(new Date(anio, mes - 1, 1));
        return texto.charAt(0).toUpperCase() + texto.slice(1);
    } catch {
        return String(valor);
    }
}

/**
 * Formatea un periodo `YYYY-MM` en versión corta para etiquetas de gráficos.
 * @param {string} valor Periodo ISO.
 * @returns {string} Periodo corto legible.
 */
function formatPeriodoCorto(valor) {
    const [anio, mes] = String(valor).split('-').map(Number);
    if (!anio || !mes) return String(valor);
    try {
        const texto = new Intl.DateTimeFormat('es-PE', {
            month: 'short',
            year: 'numeric'
        }).format(new Date(anio, mes - 1, 1));
        return texto.charAt(0).toUpperCase() + texto.slice(1);
    } catch {
        return String(valor);
    }
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
 * Calcula un porcentaje con un decimal.
 * @param {number} valor Valor parcial.
 * @param {number} total Total.
 * @returns {string} Porcentaje sin el símbolo.
 */
function porcentaje(valor, total) {
    return !total ? '0.0' : ((valor / total) * 100).toFixed(1);
}

/**
 * Muestra un aviso en la zona de indicadores.
 * @param {string} mensaje Texto.
 * @param {'info'|'success'|'error'|'warning'} [tipo='error'] Tipo visual.
 * @returns {void}
 */
function mostrarAvisoDashboard(mensaje, tipo = 'error') {
    const contenedor = document.getElementById('dashboard-alert');
    contenedor.className = `alert alert-${tipo === 'error' ? 'error' : tipo}`;
    document.getElementById('dashboard-alert-texto').textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, tipo === 'error' ? 'assertive' : 'polite');
}

/**
 * Muestra un aviso en la sección de citas.
 * @param {string} mensaje Texto.
 * @param {'info'|'success'|'error'} [tipo='info'] Tipo visual.
 * @returns {void}
 */
function mostrarAvisoCitas(mensaje, tipo = 'info') {
    const contenedor = document.getElementById('citas-alert');
    contenedor.className = `alert alert-${tipo === 'error' ? 'error' : tipo}`;
    document.getElementById('citas-alert-texto').textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, tipo === 'error' ? 'assertive' : 'polite');
}

/**
 * Muestra un aviso en la sección de personal.
 * @param {string} mensaje Texto.
 * @param {'info'|'success'|'error'|'warning'} [tipo='info'] Tipo visual.
 * @returns {void}
 */
function mostrarAvisoPersonal(mensaje, tipo = 'info') {
    const contenedor = document.getElementById('personal-alert');
    contenedor.className = `alert alert-${tipo === 'error' ? 'error' : tipo}`;
    document.getElementById('personal-alert-texto').textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, tipo === 'error' ? 'assertive' : 'polite');
}

/**
 * Muestra un aviso en la sección de lugares de atención.
 * @param {string} mensaje Texto.
 * @param {'info'|'success'|'error'} [tipo='info'] Tipo visual.
 * @returns {void}
 */
function mostrarAvisoLugares(mensaje, tipo = 'info') {
    const contenedor = document.getElementById('lugares-alert');
    contenedor.className = `alert alert-${tipo === 'error' ? 'error' : tipo}`;
    document.getElementById('lugares-alert-texto').textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, tipo === 'error' ? 'assertive' : 'polite');
}

/**
 * Muestra un aviso en la sección de medicamentos.
 * @param {string} mensaje Texto.
 * @param {'info'|'success'|'error'} [tipo='info'] Tipo visual.
 * @returns {void}
 */
function mostrarAvisoMedicamentos(mensaje, tipo = 'info') {
    const contenedor = document.getElementById('medicamentos-alert');
    contenedor.className = `alert alert-${tipo === 'error' ? 'error' : tipo}`;
    document.getElementById('medicamentos-alert-texto').textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, tipo === 'error' ? 'assertive' : 'polite');
}

/**
 * Devuelve la paleta de gráficos adaptada al modo de alto contraste.
 * @returns {string[]} Colores disponibles.
 */
function paletaGraficos() {
    if (document.documentElement.classList.contains('high-contrast')) {
        return ['#ffd400', '#ffdd44', '#e6bf00', '#ccaa00', '#b39700'];
    }
    return ['#006d7d', '#d97706', '#146c34', '#a4161a', '#6b21a8'];
}

/**
 * Lee los tokens de color actuales del documento.
 * @returns {{ texto: string, borde: string, superficie: string, contraste: boolean }} Tokens.
 */
function tokensGrafico() {
    const estilos = getComputedStyle(document.documentElement);
    return {
        texto: estilos.getPropertyValue('--ink').trim() || '#123238',
        borde: estilos.getPropertyValue('--border').trim() || '#c3dde1',
        superficie: estilos.getPropertyValue('--surface').trim() || '#ffffff',
        contraste: document.documentElement.classList.contains('high-contrast')
    };
}

/**
 * Prepara los datos de citas por especialidad ordenados de mayor a menor.
 * @param {{ labels?: string[], values?: number[] }} grafico Datos de la API.
 * @returns {{ etiquetas: string[], valores: number[], filas: Array<{ etiqueta: string, valor: number }>, total: number }}
 */
function prepararEspecialidades(grafico) {
    const etiquetas = Array.isArray(grafico.labels) ? grafico.labels : [];
    const valores = Array.isArray(grafico.values) ? grafico.values.map((n) => Number(n) || 0) : [];
    const filas = etiquetas
        .map((etiqueta, indice) => ({ etiqueta, valor: valores[indice] || 0 }))
        .sort((a, b) => b.valor - a.valor);
    return {
        etiquetas: filas.map((f) => f.etiqueta),
        valores: filas.map((f) => f.valor),
        filas,
        total: filas.reduce((s, f) => s + f.valor, 0)
    };
}

/**
 * Prepara los datos de evolución mensual.
 * @param {{ labels?: string[], programadas?: number[], atendidas?: number[] }} grafico Datos.
 * @returns {{ etiquetas: string[], programadas: number[], atendidas: number[], filas: Array<{ etiqueta: string, programadas: number, atendidas: number }>, total: number }}
 */
function prepararEvolucion(grafico) {
    const etiquetas = Array.isArray(grafico.labels) ? grafico.labels : [];
    const programadas = Array.isArray(grafico.programadas) ? grafico.programadas.map((n) => Number(n) || 0) : [];
    const atendidas = Array.isArray(grafico.atendidas) ? grafico.atendidas.map((n) => Number(n) || 0) : [];
    const filas = etiquetas.map((etiqueta, indice) => ({
        etiqueta,
        programadas: programadas[indice] || 0,
        atendidas: atendidas[indice] || 0
    }));
    return {
        etiquetas,
        programadas: filas.map((f) => f.programadas),
        atendidas: filas.map((f) => f.atendidas),
        filas,
        total: filas.reduce((s, f) => s + f.programadas, 0)
    };
}

/**
 * Prepara los datos de distribución por estado.
 * @param {{ labels?: string[], values?: number[] }} grafico Datos.
 * @returns {{ etiquetas: string[], valores: number[], filas: Array<{ etiqueta: string, valor: number }>, total: number }}
 */
function prepararEstados(grafico) {
    const etiquetas = Array.isArray(grafico.labels) ? grafico.labels : [];
    const valores = Array.isArray(grafico.values) ? grafico.values.map((n) => Number(n) || 0) : [];
    const filas = etiquetas.map((etiqueta, indice) => ({ etiqueta, valor: valores[indice] || 0 }));
    return {
        etiquetas,
        valores,
        filas,
        total: filas.reduce((s, f) => s + f.valor, 0)
    };
}

/**
 * Devuelve una fila de tabla que ocupa todas las columnas.
 * @param {number} columnas Número de columnas.
 * @param {string} mensaje Mensaje.
 * @returns {string} HTML de la fila.
 */
function filaVacia(columnas, mensaje) {
    return `<tr><td colspan="${columnas}" class="table-empty">${escapeHtml(mensaje)}</td></tr>`;
}

/**
 * Renderiza la tabla equivalente del gráfico de especialidades.
 * @param {ReturnType<typeof prepararEspecialidades>} datos Datos preparados.
 * @returns {string} Resumen textual.
 */
function renderTablaEspecialidades(datos) {
    const cuerpo = document.getElementById('tabla-especialidad');
    if (datos.filas.length === 0) {
        cuerpo.innerHTML = filaVacia(3, 'Sin datos de especialidades para los filtros seleccionados.');
        return 'No hay citas registradas para los filtros seleccionados.';
    }
    cuerpo.innerHTML = datos.filas.map((fila) => `
        <tr>
            <th scope="row">${escapeHtml(fila.etiqueta)}</th>
            <td>${fila.valor}</td>
            <td>${porcentaje(fila.valor, datos.total)}%</td>
        </tr>
    `).join('');
    if (datos.total === 0) return 'No hay citas registradas para los filtros seleccionados.';
    const principal = datos.filas[0];
    return `Se registraron ${datos.total} citas en ${datos.filas.length} especialidad(es). ${principal.etiqueta} concentra ${principal.valor} citas (${porcentaje(principal.valor, datos.total)}%).`;
}

/**
 * Renderiza la tabla equivalente del gráfico de evolución mensual.
 * @param {ReturnType<typeof prepararEvolucion>} datos Datos preparados.
 * @returns {string} Resumen textual.
 */
function renderTablaEvolucion(datos) {
    const cuerpo = document.getElementById('tabla-evolucion');
    if (datos.filas.length === 0) {
        cuerpo.innerHTML = filaVacia(3, 'Sin datos mensuales para los filtros seleccionados.');
        return 'No hay citas registradas para los filtros seleccionados.';
    }
    cuerpo.innerHTML = datos.filas.map((fila) => `
        <tr>
            <th scope="row">${escapeHtml(formatPeriodoCorto(fila.etiqueta))}</th>
            <td>${fila.programadas}</td>
            <td>${fila.atendidas}</td>
        </tr>
    `).join('');
    if (datos.total === 0) return 'No hay citas registradas para los filtros seleccionados.';
    const principal = datos.filas.reduce((maximo, fila) =>
        fila.programadas > maximo.programadas ? fila : maximo, datos.filas[0]);
    const atendidas = datos.atendidas.reduce((suma, valor) => suma + valor, 0);
    return `Se registraron ${datos.total} citas en ${datos.filas.length} mes(es); ${atendidas} fueron atendidas. El mes con más citas programadas fue ${formatPeriodoCorto(principal.etiqueta)} con ${principal.programadas}.`;
}

/**
 * Renderiza la tabla equivalente del gráfico de estados.
 * @param {ReturnType<typeof prepararEstados>} datos Datos preparados.
 * @returns {string} Resumen textual.
 */
function renderTablaEstados(datos) {
    const cuerpo = document.getElementById('tabla-estados');
    if (datos.filas.length === 0) {
        cuerpo.innerHTML = filaVacia(3, 'Sin datos de estados para los filtros seleccionados.');
        return 'No hay citas registradas para los filtros seleccionados.';
    }
    cuerpo.innerHTML = datos.filas.map((fila) => `
        <tr>
            <th scope="row">${escapeHtml(fila.etiqueta)}</th>
            <td>${fila.valor}</td>
            <td>${porcentaje(fila.valor, datos.total)}%</td>
        </tr>
    `).join('');
    if (datos.total === 0) return 'No hay citas registradas para los filtros seleccionados.';
    const principal = datos.filas.reduce((maximo, fila) =>
        fila.valor > maximo.valor ? fila : maximo, datos.filas[0]);
    const buscar = (nombre) => {
        const indice = datos.etiquetas.findIndex((etiqueta) => etiqueta.toLowerCase() === nombre.toLowerCase());
        return indice >= 0 ? (datos.valores[indice] || 0) : 0;
    };
    const activas = buscar('Reservadas') + buscar('Reprogramadas');
    return `Se contabilizaron ${datos.total} citas: ${activas} activas, ${buscar('Atendidas')} atendidas, ${buscar('Canceladas')} canceladas y ${buscar('Inasistencias')} inasistencias. El estado más frecuente es ${principal.etiqueta} con ${principal.valor}.`;
}

/**
 * Destruye las instancias de gráficos existentes antes de volver a dibujar.
 * @returns {void}
 */
function destruirGraficos() {
    Object.values(estado.charts).forEach((grafico) => {
        try {
            grafico.destroy();
        } catch {
            /* La instancia ya pudo haber sido destruida. */
        }
    });
    estado.charts = {};
}

/**
 * Renderiza los tres gráficos y sus tablas equivalentes.
 * @param {Record<string, any>} graficos Datos de gráficos de la API.
 * @returns {void}
 */
function renderGraficos(graficos) {
    const especialidades = prepararEspecialidades(graficos.citasPorEspecialidad || {});
    const evolucion = prepararEvolucion(graficos.evolucionMensual || {});
    const estados = prepararEstados(graficos.distribucionPorEstado || {});

    let resumenEspecialidades = renderTablaEspecialidades(especialidades);
    let resumenEvolucion = renderTablaEvolucion(evolucion);
    let resumenEstados = renderTablaEstados(estados);

    const hayChart = typeof window.Chart === 'function';
    if (!hayChart) {
        const aviso = ' La gráfica no está disponible; consulte la tabla de datos equivalente.';
        resumenEspecialidades += aviso;
        resumenEvolucion += aviso;
        resumenEstados += aviso;
        document.querySelectorAll('.chart-frame').forEach((marco) => {
            marco.hidden = true;
        });
        mostrarAvisoDashboard(
            'No se pudo cargar la biblioteca de gráficos. Los indicadores y las tablas equivalentes siguen disponibles.',
            'warning'
        );
    } else {
        document.querySelectorAll('.chart-frame').forEach((marco) => {
            marco.hidden = false;
        });
    }

    document.getElementById('resumen-grafico-especialidad').textContent = resumenEspecialidades;
    document.getElementById('resumen-grafico-evolucion').textContent = resumenEvolucion;
    document.getElementById('resumen-grafico-estados').textContent = resumenEstados;

    if (!hayChart) {
        destruirGraficos();
        return;
    }

    destruirGraficos();

    const tokens = tokensGrafico();
    const paleta = paletaGraficos();
    const rejilla = tokens.contraste ? 'rgba(255, 212, 0, 0.28)' : tokens.borde;
    const animacion = prefiereMovimientoReducido() ? false : { duration: 550 };
    const tooltip = {
        backgroundColor: tokens.contraste ? '#000000' : '#123238',
        titleColor: tokens.contraste ? '#ffd400' : '#ffffff',
        bodyColor: tokens.contraste ? '#ffd400' : '#ffffff',
        borderColor: tokens.contraste ? '#ffd400' : tokens.borde,
        borderWidth: 2
    };

    window.Chart.defaults.font.family = "'Atkinson Hyperlegible', 'Segoe UI', Tahoma, sans-serif";
    window.Chart.defaults.font.size = 12;
    window.Chart.defaults.color = tokens.texto;

    const lienzoEspecialidad = document.getElementById('grafico-especialidad');
    lienzoEspecialidad.setAttribute('aria-label', 'Gráfico de barras de citas por especialidad');
    estado.charts.especialidad = new window.Chart(lienzoEspecialidad, {
        type: 'bar',
        data: {
            labels: especialidades.etiquetas,
            datasets: [{
                label: 'Citas',
                data: especialidades.valores,
                backgroundColor: especialidades.etiquetas.map((_, indice) => paleta[indice % paleta.length]),
                borderColor: tokens.texto,
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: animacion,
            plugins: { legend: { display: false }, tooltip },
            scales: {
                x: { ticks: { color: tokens.texto }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: tokens.texto, precision: 0 }, grid: { color: rejilla } }
            }
        }
    });

    const lienzoEvolucion = document.getElementById('grafico-evolucion');
    lienzoEvolucion.setAttribute('aria-label', 'Gráfico de líneas de citas programadas y atendidas por mes');
    estado.charts.evolucion = new window.Chart(lienzoEvolucion, {
        type: 'line',
        data: {
            labels: evolucion.etiquetas.map(formatPeriodoCorto),
            datasets: [
                {
                    label: 'Programadas',
                    data: evolucion.programadas,
                    borderColor: paleta[0],
                    backgroundColor: paleta[0],
                    borderWidth: 3,
                    pointRadius: 4,
                    tension: 0.3
                },
                {
                    label: 'Atendidas',
                    data: evolucion.atendidas,
                    borderColor: paleta[2],
                    backgroundColor: paleta[2],
                    borderWidth: 3,
                    pointRadius: 4,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: animacion,
            plugins: { legend: { labels: { color: tokens.texto, boxWidth: 18 } }, tooltip },
            scales: {
                x: { ticks: { color: tokens.texto }, grid: { color: rejilla } },
                y: { beginAtZero: true, ticks: { color: tokens.texto, precision: 0 }, grid: { color: rejilla } }
            }
        }
    });

    const lienzoEstados = document.getElementById('grafico-estados');
    lienzoEstados.setAttribute('aria-label', 'Gráfico circular de distribución de citas por estado');
    estado.charts.estados = new window.Chart(lienzoEstados, {
        type: 'doughnut',
        data: {
            labels: estados.etiquetas,
            datasets: [{
                data: estados.valores,
                backgroundColor: estados.etiquetas.map((_, indice) => paleta[indice % paleta.length]),
                borderColor: tokens.superficie,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: animacion,
            cutout: '58%',
            plugins: { legend: { position: 'bottom', labels: { color: tokens.texto, boxWidth: 18 } }, tooltip }
        }
    });
}

/**
 * Pinta los KPIs, el resumen de filtros y los gráficos.
 * @param {Record<string, any>} datos Respuesta de la API.
 * @returns {void}
 */
function renderIndicadores(datos) {
    const kpis = datos.kpis || {};
    const programadas = Number(kpis.citasProgramadas) || 0;
    const atendidas = Number(kpis.citasAtendidas) || 0;
    const canceladas = Number(kpis.citasCanceladas) || 0;
    const inasistencias = Number(kpis.inasistencias) || 0;
    const activas = Number(kpis.citasActivas) || 0;
    const tasa = Number(kpis.porcentajeInasistencia) || 0;

    document.getElementById('kpi-programadas').textContent = String(programadas);
    document.getElementById('nota-programadas').textContent = `${activas} cita(s) activa(s) en este momento.`;

    document.getElementById('kpi-atendidas').textContent = String(atendidas);
    document.getElementById('nota-atendidas').textContent = `${porcentaje(atendidas, programadas)}% del total de citas programadas.`;

    document.getElementById('kpi-canceladas').textContent = String(canceladas);
    document.getElementById('nota-canceladas').textContent = `${porcentaje(canceladas, programadas)}% del total de citas programadas.`;

    document.getElementById('kpi-inasistencia').textContent = `${tasa.toFixed(1)}%`;
    document.getElementById('nota-inasistencia').textContent = `${inasistencias} de ${programadas} citas programadas.`;

    const filtros = datos.filtrosAplicados || {};
    const periodo = filtros.periodo && filtros.periodo !== 'todos'
        ? formatPeriodo(filtros.periodo)
        : 'todos los periodos';
    const especialidad = filtros.especialidad && filtros.especialidad !== 'todas'
        ? filtros.especialidad
        : 'todas las especialidades';
    document.getElementById('resumen-filtros').textContent = `Mostrando ${periodo} y ${especialidad}.`;

    renderGraficos(datos.graficos || {});
    document.getElementById('dashboard-contenido').hidden = false;
}

/**
 * Carga los indicadores desde la API.
 * @param {boolean} [anunciar=true] Si debe anunciar el resultado.
 * @returns {Promise<void>}
 */
async function cargarIndicadores(anunciar = true) {
    const cargando = document.getElementById('dashboard-loading');
    if (cargando) cargando.hidden = false;
    document.getElementById('dashboard-alert').hidden = true;

    try {
        const datos = await getIndicadores(estado.filtros);
        estado.indicadores = datos;
        renderIndicadores(datos);
        if (anunciar) {
            const kpis = datos.kpis || {};
            announce(
                `Indicadores actualizados. ${kpis.citasProgramadas || 0} citas programadas, ${kpis.citasAtendidas || 0} atendidas y una tasa de inasistencia de ${kpis.porcentajeInasistencia || 0} por ciento.`,
                'polite'
            );
        }
    } catch (error) {
        mostrarAvisoDashboard(error.message || 'No se pudieron calcular los indicadores.', 'error');
    } finally {
        if (cargando) cargando.hidden = true;
    }
}

/**
 * Renderiza la tabla de todas las citas del sistema.
 * @returns {void}
 */
function renderCitasAdmin() {
    const contenedor = document.getElementById('citas-tabla-contenedor');
    const vacio = document.getElementById('citas-empty');
    const cuerpo = document.getElementById('cuerpo-citas-admin');

    document.getElementById('caption-citas-admin').textContent =
        `Citas registradas en el sistema (${estado.citas.length} registros)`;

    if (estado.citas.length === 0) {
        cuerpo.innerHTML = '';
        contenedor.hidden = true;
        vacio.hidden = false;
        return;
    }

    vacio.hidden = true;
    contenedor.hidden = false;

    cuerpo.innerHTML = estado.citas.map((cita) => {
        const acciones = esCitaActiva(cita.estado)
            ? `<button type="button" class="btn btn-danger btn-small" data-accion="cancelar" data-id="${cita.id}">Cancelar</button>`
            : '<span class="help">Sin acciones</span>';

        return `
            <tr>
                <th scope="row">${escapeHtml(cita.codigo_atencion)}</th>
                <td>${escapeHtml(formatFecha(cita.fecha_cita))}<span class="choice-meta">${escapeHtml(cita.hora_cita)}</span></td>
                <td>${escapeHtml(cita.nombre_paciente)}<span class="choice-meta">DNI ${escapeHtml(cita.dni_paciente)}</span></td>
                <td>${escapeHtml(cita.hospital_nombre)}</td>
                <td>${escapeHtml(cita.especialidad_nombre)}</td>
                <td>${escapeHtml(cita.medico_nombre)}</td>
                <td>${htmlEstado(cita.estado)}</td>
                <td><div class="actions">${acciones}</div></td>
            </tr>
        `;
    }).join('');
}

/**
 * Carga todas las citas del sistema.
 * @param {boolean} [anunciar=true] Si debe anunciar el resultado.
 * @returns {Promise<void>}
 */
async function cargarCitas(anunciar = true) {
    const cargando = document.getElementById('citas-loading');
    const contenedor = document.getElementById('citas-tabla-contenedor');
    const vacio = document.getElementById('citas-empty');
    if (cargando) cargando.hidden = false;
    contenedor.hidden = true;
    vacio.hidden = true;
    document.getElementById('citas-alert').hidden = true;

    try {
        estado.citas = await getCitas();
        renderCitasAdmin();
        if (anunciar) {
            announce(`Citas actualizadas. ${estado.citas.length} registros en el sistema.`, 'polite');
        }
    } catch (error) {
        mostrarAvisoCitas(error.message || 'No se pudieron cargar las citas.', 'error');
        vacio.hidden = false;
    } finally {
        if (cargando) cargando.hidden = true;
    }
}

/**
 * Renderiza la tabla de usuarios del sistema.
 * @returns {void}
 */
function renderUsuarios() {
    const contenedor = document.getElementById('usuarios-tabla-contenedor');
    const vacio = document.getElementById('usuarios-empty');
    const cuerpo = document.getElementById('cuerpo-usuarios');

    document.getElementById('caption-usuarios').textContent =
        `Cuentas de usuario del sistema MINSA (${estado.usuarios.length} registros)`;

    if (estado.usuarios.length === 0) {
        cuerpo.innerHTML = '';
        contenedor.hidden = true;
        vacio.hidden = false;
        return;
    }

    vacio.hidden = true;
    contenedor.hidden = false;

    cuerpo.innerHTML = estado.usuarios.map((usuario) => {
        const rol = ROLES_LABELS[usuario.rol] || usuario.rol;
        const activo = Number(usuario.activo) === 1;
        const estadoCuenta = activo
            ? '<span class="state state--atendida"><span class="state-icon" aria-hidden="true">✔</span>Activo</span>'
            : '<span class="state state--cancelada"><span class="state-icon" aria-hidden="true">✖</span>Inactivo</span>';
        let medico = '—';
        if (usuario.medico_id) {
            const doctor = estado.doctores.find((item) => Number(item.id) === Number(usuario.medico_id));
            medico = doctor ? doctor.nombre : `ID ${usuario.medico_id}`;
        }
        return `
            <tr>
                <th scope="row">${escapeHtml(rol)}</th>
                <td>${escapeHtml(usuario.dni)}</td>
                <td>${escapeHtml(usuario.nombres)}</td>
                <td>${escapeHtml(usuario.email || '—')}</td>
                <td>${escapeHtml(usuario.telefono || '—')}</td>
                <td>${escapeHtml(usuario.cmp || '—')}</td>
                <td>${escapeHtml(medico)}</td>
                <td>${estadoCuenta}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Carga las cuentas de usuario (solo ADMIN).
 * @param {boolean} [anunciar=true] Si debe anunciar el resultado.
 * @returns {Promise<void>}
 */
async function cargarUsuarios(anunciar = true) {
    const cargando = document.getElementById('usuarios-loader') || document.getElementById('usuarios-loading');
    const contenedor = document.getElementById('usuarios-tabla-contenedor');
    const vacio = document.getElementById('usuarios-empty');
    if (cargando) cargando.hidden = false;
    contenedor.hidden = true;
    vacio.hidden = true;

    try {
        estado.usuarios = await listarUsuarios();
        renderUsuarios();
        if (anunciar) {
            announce(`Usuarios actualizados. ${estado.usuarios.length} cuentas registradas.`, 'polite');
        }
    } catch (error) {
        mostrarAvisoPersonal(error.message || 'No se pudieron cargar los usuarios.', 'error');
        vacio.hidden = false;
    } finally {
        if (cargando) cargando.hidden = true;
    }
}

/**
 * Carga médicos para el alta de personal.
 * @returns {Promise<void>}
 */
async function cargarCatalogos() {
    try {
        estado.doctores = await getDoctores();
        const select = document.getElementById('staff-medico');
        if (select) {
            select.innerHTML = '<option value="">Sin vínculo con un médico</option>' +
                estado.doctores.map((doctor) => `
                    <option value="${doctor.id}">${escapeHtml(doctor.nombre)} (${escapeHtml(doctor.cmp)}) · ${escapeHtml(doctor.especialidad)}</option>
                `).join('');
        }
    } catch (error) {
        mostrarAvisoPersonal(
            error.message || 'No se pudo cargar el catálogo de médicos para vincular cuentas.',
            'error'
        );
    }
}

/**
 * Deriva las especialidades únicas desde los hospitales cargados y actualiza los
 * selectores y la lista de verificación del alta de lugares.
 * @returns {void}
 */
function actualizarEspecialidadesDesdeHospitales() {
    const mapa = new Map();
    estado.hospitales.forEach((hospital) => {
        (hospital.especialidades || []).forEach((especialidad) => {
            if (!mapa.has(Number(especialidad.id))) {
                mapa.set(Number(especialidad.id), especialidad.nombre);
            }
        });
    });
    estado.especialidadesCatalogo = [...mapa.entries()]
        .map(([id, nombre]) => ({ id, nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    estado.especialidades = estado.especialidadesCatalogo.map((item) => item.nombre);

    const select = document.getElementById('especialidad-dashboard');
    if (select) {
        select.innerHTML = '<option value="">Todas las especialidades</option>' +
            estado.especialidades.map((nombre) =>
                `<option value="${escapeHtml(nombre)}">${escapeHtml(nombre)}</option>`
            ).join('');
    }

    const contenedor = document.getElementById('hospital-especialidades');
    if (contenedor) {
        if (estado.especialidadesCatalogo.length === 0) {
            contenedor.innerHTML = '<p class="empty-state">No hay especialidades registradas en el sistema.</p>';
        } else {
            contenedor.innerHTML = estado.especialidadesCatalogo.map((especialidad) => `
                <label class="choice-card">
                    <input type="checkbox" name="hospital-especialidad" value="${especialidad.id}">
                    <span class="choice-body">
                        <span class="choice-title">${escapeHtml(especialidad.nombre)}</span>
                    </span>
                </label>
            `).join('');
        }
    }
}

/**
 * Renderiza la tabla de lugares de atención registrados.
 * @returns {void}
 */
function renderHospitales() {
    const contenedor = document.getElementById('hospitales-tabla-contenedor');
    const vacio = document.getElementById('hospitales-empty');
    const cuerpo = document.getElementById('cuerpo-hospitales');

    document.getElementById('caption-hospitales').textContent =
        `Establecimientos de salud registrados (${estado.hospitales.length} registros)`;

    if (estado.hospitales.length === 0) {
        cuerpo.innerHTML = '';
        contenedor.hidden = true;
        vacio.hidden = false;
        return;
    }

    vacio.hidden = true;
    contenedor.hidden = false;

    cuerpo.innerHTML = estado.hospitales.map((hospital) => {
        const especialidades = (hospital.especialidades || []).map((especialidad) => especialidad.nombre);
        const coordenadas = `${Number(hospital.latitud).toFixed(4)}, ${Number(hospital.longitud).toFixed(4)}`;
        return `
            <tr>
                <th scope="row">${escapeHtml(hospital.nombre)}</th>
                <td>${escapeHtml(hospital.red)}</td>
                <td>${escapeHtml(hospital.distrito)}</td>
                <td>${escapeHtml(hospital.direccion)}</td>
                <td>${escapeHtml(coordenadas)}</td>
                <td>${especialidades.length === 0 ? '—' : escapeHtml(especialidades.join(', '))}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Carga los lugares de atención desde la API.
 * @param {boolean} [anunciar=true] Si debe anunciar el resultado.
 * @returns {Promise<void>}
 */
async function cargarHospitales(anunciar = true) {
    const cargando = document.getElementById('hospitales-loader') || document.getElementById('hospitales-loading');
    const contenedor = document.getElementById('hospitales-tabla-contenedor');
    const vacio = document.getElementById('hospitales-empty');
    if (cargando) cargando.hidden = false;
    contenedor.hidden = true;
    vacio.hidden = true;

    try {
        estado.hospitales = await getHospitales();
        actualizarEspecialidadesDesdeHospitales();
        renderHospitales();
        if (anunciar) {
            announce(`Lugares actualizados. ${estado.hospitales.length} establecimientos registrados.`, 'polite');
        }
    } catch (error) {
        mostrarAvisoLugares(error.message || 'No se pudieron cargar los lugares de atención.', 'error');
        vacio.hidden = false;
    } finally {
        if (cargando) cargando.hidden = true;
    }
}

/**
 * Renderiza la tabla del catálogo de medicamentos.
 * @returns {void}
 */
function renderMedicamentos() {
    const contenedor = document.getElementById('medicamentos-tabla-contenedor');
    const vacio = document.getElementById('medicamentos-empty');
    const cuerpo = document.getElementById('cuerpo-medicamentos');

    document.getElementById('caption-medicamentos').textContent =
        `Catálogo de medicamentos del MINSA (${estado.medicamentos.length} registros)`;

    if (estado.medicamentos.length === 0) {
        cuerpo.innerHTML = '';
        contenedor.hidden = true;
        vacio.hidden = false;
        return;
    }

    vacio.hidden = true;
    contenedor.hidden = false;

    cuerpo.innerHTML = estado.medicamentos.map((medicamento) => {
        const activo = Number(medicamento.activo) === 1;
        const estadoHtml = activo
            ? '<span class="state state--atendida"><span class="state-icon" aria-hidden="true">✔</span>Activo</span>'
            : '<span class="state state--cancelada"><span class="state-icon" aria-hidden="true">✖</span>Inactivo</span>';
        return `
            <tr>
                <th scope="row">${escapeHtml(medicamento.codigo)}</th>
                <td>${escapeHtml(medicamento.nombre)}</td>
                <td>${escapeHtml(medicamento.presentacion)}</td>
                <td>${escapeHtml(medicamento.concentracion)}</td>
                <td>${escapeHtml(String(medicamento.stock))}</td>
                <td>${estadoHtml}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Carga el catálogo de medicamentos desde la API.
 * @param {boolean} [anunciar=true] Si debe anunciar el resultado.
 * @returns {Promise<void>}
 */
async function cargarMedicamentos(anunciar = true) {
    const cargando = document.getElementById('medicamentos-loader') || document.getElementById('medicamentos-loading');
    const contenedor = document.getElementById('medicamentos-tabla-contenedor');
    const vacio = document.getElementById('medicamentos-empty');
    if (cargando) cargando.hidden = false;
    contenedor.hidden = true;
    vacio.hidden = true;

    try {
        estado.medicamentos = await getMedicamentos();
        renderMedicamentos();
        if (anunciar) {
            announce(`Medicamentos actualizados. ${estado.medicamentos.length} registros en el catálogo.`, 'polite');
        }
    } catch (error) {
        mostrarAvisoMedicamentos(error.message || 'No se pudo cargar el catálogo de medicamentos.', 'error');
        vacio.hidden = false;
    } finally {
        if (cargando) cargando.hidden = true;
    }
}

/**
 * Muestra un aviso en la sección de horarios (admin).
 * @param {string} mensaje Texto.
 * @param {'info'|'success'|'error'|'warning'} [tipo='info'] Tipo visual.
 * @returns {void}
 */
function mostrarAvisoHorariosAdmin(mensaje, tipo = 'info') {
    const contenedor = document.getElementById('horarios-admin-alert');
    contenedor.className = `alert alert-${tipo === 'error' ? 'error' : tipo}`;
    document.getElementById('horarios-admin-alert-texto').textContent = mensaje;
    contenedor.hidden = false;
    announce(mensaje, tipo === 'error' ? 'assertive' : 'polite');
}

/**
 * Renderiza la tabla de horarios registrados (admin).
 * @returns {void}
 */
function renderHorariosAdmin() {
    const contenedor = document.getElementById('horarios-admin-tabla-contenedor');
    const vacio = document.getElementById('horarios-admin-empty');
    const cuerpo = document.getElementById('cuerpo-horarios-admin');

    document.getElementById('caption-horarios-admin').textContent =
        `Bloques horarios disponibles para reserva (${estado.horariosAdmin.length} registros)`;

    if (estado.horariosAdmin.length === 0) {
        cuerpo.innerHTML = '';
        contenedor.hidden = true;
        vacio.hidden = false;
        return;
    }

    vacio.hidden = true;
    contenedor.hidden = false;

    cuerpo.innerHTML = estado.horariosAdmin.map((horario) => {
        const disponible = Number(horario.disponible) === 1;
        const estadoHtml = disponible
            ? '<span class="state state--atendida"><span class="state-icon" aria-hidden="true">✔</span>Disponible</span>'
            : '<span class="state state--cancelada"><span class="state-icon" aria-hidden="true">●</span>Ocupado</span>';
        const medico = horario.medico_nombre || `ID ${horario.medico_id}`;
        const especialidad = horario.especialidad || '—';
        const hospital = horario.hospital || '—';
        return `
            <tr>
                <th scope="row">${escapeHtml(medico)}</th>
                <td>${escapeHtml(especialidad)}</td>
                <td>${escapeHtml(hospital)}</td>
                <td>${escapeHtml(formatFecha(horario.fecha))}</td>
                <td>${escapeHtml(horario.hora)}</td>
                <td>${estadoHtml}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Carga los horarios registrados desde la API (para admin).
 * @param {boolean} [anunciar=true] Si debe anunciar el resultado.
 * @returns {Promise<void>}
 */
async function cargarHorariosAdmin(anunciar = true) {
    const cargando = document.getElementById('horarios-admin-loader') || document.getElementById('horarios-admin-loading');
    const contenedor = document.getElementById('horarios-admin-tabla-contenedor');
    const vacio = document.getElementById('horarios-admin-empty');
    if (cargando) cargando.hidden = false;
    contenedor.hidden = true;
    vacio.hidden = true;
    document.getElementById('horarios-admin-alert').hidden = true;

    try {
        const doctores = await getDoctores();
        const horarios = [];
        doctores.forEach((doctor) => {
            (doctor.horarios || []).forEach((h) => {
                horarios.push({
                    ...h,
                    medico_id: doctor.id,
                    medico_nombre: doctor.nombre,
                    medico_cmp: doctor.cmp,
                    especialidad: doctor.especialidad,
                    hospital: doctor.hospital
                });
            });
        });
        estado.horariosAdmin = horarios;
        renderHorariosAdmin();
        if (anunciar) {
            announce(`Horarios actualizados. ${estado.horariosAdmin.length} bloques registrados.`, 'polite');
        }
    } catch (error) {
        mostrarAvisoHorariosAdmin(error.message || 'No se pudieron cargar los horarios.', 'error');
        vacio.hidden = false;
    } finally {
        if (cargando) cargando.hidden = true;
    }
}

/**
 * Carga los médicos en el selector del formulario de horarios (admin).
 * @returns {Promise<void>}
 */
async function cargarMedicosParaHorarios() {
    try {
        const doctores = await getDoctores();
        const select = document.getElementById('horario-admin-medico');
        if (select) {
            select.innerHTML = '<option value="">Seleccione un médico…</option>' +
                doctores.map((doctor) => `
                    <option value="${doctor.id}">${escapeHtml(doctor.nombre)} (${escapeHtml(doctor.cmp)}) · ${escapeHtml(doctor.especialidad)}</option>
                `).join('');
        }
    } catch (error) {
        mostrarAvisoHorariosAdmin(error.message || 'No se pudo cargar la lista de médicos.', 'error');
    }
}

/**
 * Marca o desmarca un campo como inválido.
 * @param {HTMLElement} campo Campo del formulario.
 * @param {boolean} invalido Estado de validez.
 * @returns {void}
 */
function marcarInvalido(campo, invalido) {
    if (invalido) {
        campo.setAttribute('aria-invalid', 'true');
    } else {
        campo.removeAttribute('aria-invalid');
    }
}

/**
 * Registra un nuevo bloque horario desde el dashboard (admin).
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function enviarHorarioAdmin(event) {
    event.preventDefault();
    const medico = document.getElementById('horario-admin-medico');
    const fecha = document.getElementById('horario-admin-fecha');
    const hora = document.getElementById('horario-admin-hora');

    const validaciones = [
        { campo: medico, valido: medico.value !== '', mensaje: 'Seleccione un médico.' },
        { campo: fecha, valido: fecha.value !== '', mensaje: 'Seleccione la fecha.' },
        { campo: hora, valido: hora.value !== '', mensaje: 'Seleccione la hora.' }
    ];

    validaciones.forEach((item) => marcarInvalido(item.campo, !item.valido));
    const primerError = validaciones.find((item) => !item.valido);
    if (primerError) {
        mostrarAvisoHorariosAdmin(primerError.mensaje, 'error');
        primerError.campo.focus();
        return;
    }

    const hoy = new Date();
    const fechaElegida = new Date(`${fecha.value}T00:00:00`);
    const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (Number.isNaN(fechaElegida.getTime()) || fechaElegida < hoySinHora) {
        mostrarAvisoHorariosAdmin('La fecha del bloque debe ser hoy o una fecha futura.', 'error');
        fecha.focus();
        return;
    }

    const boton = document.getElementById('btn-crear-horario-admin');
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Registrando…';

    try {
        const [h, m] = hora.value.split(':').map(Number);
        const periodo = h >= 12 ? 'PM' : 'AM';
        const hora12 = h % 12 === 0 ? 12 : h % 12;
        const horaFormateada = `${String(hora12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${periodo}`;

        await crearHorario({
            medicoId: Number(medico.value),
            fecha: fecha.value,
            hora: horaFormateada
        });
        mostrarAvisoHorariosAdmin(
            `Bloque horario registrado para ${medico.options[medico.selectedIndex].text} el ${formatFecha(fecha.value)} a las ${horaFormateada}.`,
            'success'
        );
        document.getElementById('form-horario-admin').reset();
        validaciones.forEach((item) => marcarInvalido(item.campo, false));
        await cargarHorariosAdmin(false);
    } catch (error) {
        mostrarAvisoHorariosAdmin(error.message || 'No se pudo registrar el horario.', 'error');
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = 'Registrar horario';
    }
}

/**
 * Muestra u oculta los campos exclusivos del rol EMPLEADO.
 * @returns {void}
 */
function actualizarCamposRol() {
    const rol = document.getElementById('staff-rol').value;
    const esEmpleado = rol === 'EMPLEADO';
    document.getElementById('campo-cmp-staff').hidden = !esEmpleado;
    document.getElementById('campo-medico-staff').hidden = !esEmpleado;
    document.getElementById('staff-cmp').disabled = !esEmpleado;
    document.getElementById('staff-medico').disabled = !esEmpleado;
}

/**
 * Limpia las marcas de invalidación del formulario de personal.
 * @returns {void}
 */
function limpiarInvalidosStaff() {
    ['staff-dni', 'staff-nombres', 'staff-email', 'staff-telefono', 'staff-password', 'staff-cmp', 'staff-medico']
        .forEach((id) => marcarInvalido(document.getElementById(id), false));
}

/**
 * Abre el diálogo para cancelar una cita desde el dashboard.
 * @param {Record<string, any>} cita Cita seleccionada.
 * @returns {void}
 */
function abrirCancelar(cita) {
    if (!cita) return;
    estado.citaCancelar = cita;
    document.getElementById('cancelar-dashboard-cita-id').value = String(cita.id);
    document.getElementById('cancelar-dashboard-motivo').value = '';
    document.getElementById('cancelar-dashboard-resumen').textContent =
        `¿Desea cancelar la cita ${cita.codigo_atencion} del ${formatFecha(cita.fecha_cita)} a las ${cita.hora_cita} del paciente ${cita.nombre_paciente}? El horario quedará libre.`;
    document.getElementById('cancelar-dashboard-alert').hidden = true;

    const dialogo = document.getElementById('dlg-cancelar-dashboard');
    if (!dialogo.open) dialogo.showModal();
    document.getElementById('titulo-dlg-cancelar-dashboard').focus();
}

/**
 * Crea una cuenta institucional EMPLEADO o ADMIN.
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function enviarStaff(event) {
    event.preventDefault();
    limpiarInvalidosStaff();

    const dni = document.getElementById('staff-dni');
    const nombres = document.getElementById('staff-nombres');
    const email = document.getElementById('staff-email');
    const telefono = document.getElementById('staff-telefono');
    const password = document.getElementById('staff-password');
    const rol = document.getElementById('staff-rol');
    const cmp = document.getElementById('staff-cmp');
    const medico = document.getElementById('staff-medico');

    const telefonoLimpio = telefono.value.trim().replace(/\s+/g, '');
    const validaciones = [
        { campo: dni, valido: /^\d{8}$/.test(dni.value.trim()), mensaje: 'El DNI debe contener exactamente 8 dígitos numéricos.' },
        { campo: nombres, valido: nombres.value.trim().length >= 3, mensaje: 'Ingrese los nombres y apellidos completos.' },
        { campo: email, valido: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()), mensaje: 'Ingrese un correo institucional válido.' },
        { campo: password, valido: password.value.trim().length >= 4, mensaje: 'La contraseña debe tener al menos 4 caracteres.' },
        { campo: telefono, valido: !telefonoLimpio || /^\d{7,15}$/.test(telefonoLimpio), mensaje: 'Si ingresa un teléfono, debe tener entre 7 y 15 dígitos.' }
    ];

    const primerError = validaciones.find((item) => !item.valido);
    validaciones.forEach((item) => marcarInvalido(item.campo, !item.valido));

    if (primerError) {
        mostrarAvisoPersonal(primerError.mensaje, 'error');
        primerError.campo.focus();
        return;
    }

    const boton = document.getElementById('btn-crear-staff');
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Creando cuenta…';

    const esEmpleado = rol.value === 'EMPLEADO';
    try {
        const resultado = await crearStaff({
            dni: dni.value.trim(),
            nombres: nombres.value.trim(),
            email: email.value.trim(),
            telefono: telefonoLimpio || undefined,
            password: password.value,
            rol: rol.value,
            cmp: esEmpleado && cmp.value.trim() ? cmp.value.trim() : null,
            medicoId: esEmpleado && medico.value ? Number(medico.value) : undefined
        });
        const creado = resultado.usuario || {};
        mostrarAvisoPersonal(
            `Cuenta creada correctamente para ${creado.nombres || nombres.value.trim()} con rol ${ROLES_LABELS[rol.value] || rol.value}.`,
            'success'
        );
        document.getElementById('form-staff').reset();
        actualizarCamposRol();
        limpiarInvalidosStaff();
        await cargarUsuarios(false);
    } catch (error) {
        mostrarAvisoPersonal(error.message || 'No se pudo crear la cuenta institucional.', 'error');
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = 'Crear cuenta institucional';
    }
}

/**
 * Cancela una cita desde el dashboard.
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function enviarCancelacion(event) {
    event.preventDefault();
    const cita = estado.citaCancelar;
    if (!cita) return;

    const boton = document.getElementById('btn-confirmar-cancelar-dashboard');
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Cancelando…';

    try {
        await cancelarCita(cita.id, document.getElementById('cancelar-dashboard-motivo').value.trim());
        document.getElementById('dlg-cancelar-dashboard').close();
        mostrarAvisoCitas(`La cita ${cita.codigo_atencion} fue cancelada correctamente.`, 'success');
        await Promise.all([cargarCitas(false), cargarIndicadores(false)]);
    } catch (error) {
        document.getElementById('cancelar-dashboard-alert-texto').textContent =
            error.message || 'No se pudo cancelar la cita.';
        document.getElementById('cancelar-dashboard-alert').hidden = false;
        announce(document.getElementById('cancelar-dashboard-alert-texto').textContent, 'assertive');
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = 'Confirmar cancelación';
    }
}

/**
 * Registra un nuevo lugar de atención con sus especialidades.
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function enviarHospital(event) {
    event.preventDefault();
    const nombre = document.getElementById('hospital-nombre');
    const red = document.getElementById('hospital-red');
    const distrito = document.getElementById('hospital-distrito');
    const direccion = document.getElementById('hospital-direccion');
    const latitud = document.getElementById('hospital-latitud');
    const longitud = document.getElementById('hospital-longitud');
    const especialidades = Array.from(
        document.querySelectorAll('#hospital-especialidades input[name="hospital-especialidad"]:checked')
    ).map((input) => Number(input.value));

    const lat = Number(latitud.value);
    const lng = Number(longitud.value);
    const validaciones = [
        { campo: nombre, valido: nombre.value.trim().length >= 3, mensaje: 'Ingrese el nombre del establecimiento.' },
        { campo: red, valido: red.value.trim().length >= 2, mensaje: 'Ingrese la red asistencial.' },
        { campo: distrito, valido: distrito.value.trim().length >= 2, mensaje: 'Ingrese el distrito.' },
        { campo: direccion, valido: direccion.value.trim().length >= 3, mensaje: 'Ingrese la dirección del establecimiento.' },
        { campo: latitud, valido: !Number.isNaN(lat) && lat >= -90 && lat <= 90, mensaje: 'La latitud debe estar entre -90 y 90.' },
        { campo: longitud, valido: !Number.isNaN(lng) && lng >= -180 && lng <= 180, mensaje: 'La longitud debe estar entre -180 y 180.' }
    ];

    validaciones.forEach((item) => marcarInvalido(item.campo, !item.valido));
    const primerError = validaciones.find((item) => !item.valido);
    if (primerError) {
        mostrarAvisoLugares(primerError.mensaje, 'error');
        primerError.campo.focus();
        return;
    }
    if (especialidades.length === 0) {
        mostrarAvisoLugares('Seleccione al menos una especialidad para el establecimiento.', 'error');
        return;
    }

    const boton = document.getElementById('btn-crear-hospital');
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Registrando…';

    try {
        const resultado = await crearHospital({
            nombre: nombre.value.trim(),
            red: red.value.trim(),
            distrito: distrito.value.trim(),
            direccion: direccion.value.trim(),
            latitud: lat,
            longitud: lng,
            especialidadIds: especialidades
        });
        const creado = resultado.hospital || {};
        mostrarAvisoLugares(`Lugar registrado: ${creado.nombre || nombre.value.trim()}.`, 'success');
        document.getElementById('form-hospital').reset();
        validaciones.forEach((item) => marcarInvalido(item.campo, false));
        await cargarHospitales(false);
    } catch (error) {
        mostrarAvisoLugares(error.message || 'No se pudo registrar el lugar de atención.', 'error');
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = 'Registrar lugar';
    }
}

/**
 * Registra un nuevo medicamento en el catálogo.
 * @param {SubmitEvent} event Evento de envío.
 * @returns {Promise<void>}
 */
async function enviarMedicamento(event) {
    event.preventDefault();
    const codigo = document.getElementById('medicamento-codigo');
    const nombre = document.getElementById('medicamento-nombre');
    const presentacion = document.getElementById('medicamento-presentacion');
    const concentracion = document.getElementById('medicamento-concentracion');
    const stock = document.getElementById('medicamento-stock');

    const stockNum = Number(stock.value);
    const validaciones = [
        { campo: codigo, valido: codigo.value.trim().length >= 3, mensaje: 'Ingrese un código de medicamento válido (mínimo 3 caracteres).' },
        { campo: nombre, valido: nombre.value.trim().length >= 3, mensaje: 'Ingrese el nombre del medicamento.' },
        { campo: presentacion, valido: presentacion.value.trim().length >= 2, mensaje: 'Ingrese la presentación del medicamento.' },
        { campo: concentracion, valido: concentracion.value.trim().length >= 1, mensaje: 'Ingrese la concentración del medicamento.' },
        { campo: stock, valido: Number.isInteger(stockNum) && stockNum >= 0, mensaje: 'El stock debe ser un número entero mayor o igual a cero.' }
    ];

    validaciones.forEach((item) => marcarInvalido(item.campo, !item.valido));
    const primerError = validaciones.find((item) => !item.valido);
    if (primerError) {
        mostrarAvisoMedicamentos(primerError.mensaje, 'error');
        primerError.campo.focus();
        return;
    }

    const boton = document.getElementById('btn-crear-medicamento');
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Registrando…';

    try {
        const resultado = await crearMedicamento({
            codigo: codigo.value.trim().toUpperCase(),
            nombre: nombre.value.trim(),
            presentacion: presentacion.value.trim(),
            concentracion: concentracion.value.trim(),
            stock: stockNum
        });
        const creado = resultado.medicamento || {};
        mostrarAvisoMedicamentos(`Medicamento registrado: ${creado.nombre || nombre.value.trim()}.`, 'success');
        document.getElementById('form-medicamento').reset();
        document.getElementById('medicamento-stock').value = '0';
        validaciones.forEach((item) => marcarInvalido(item.campo, false));
        await cargarMedicamentos(false);
    } catch (error) {
        mostrarAvisoMedicamentos(error.message || 'No se pudo registrar el medicamento.', 'error');
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = 'Registrar medicamento';
    }
}

/**
 * Conecta los eventos de la vista.
 * @returns {void}
 */
function conectarEventos() {
    const formFiltros = document.getElementById('form-filtros-dashboard');
    formFiltros.addEventListener('submit', (event) => {
        event.preventDefault();
        estado.filtros = {
            periodo: document.getElementById('periodo-dashboard').value,
            especialidad: document.getElementById('especialidad-dashboard').value
        };
        cargarIndicadores(true);
    });

    document.getElementById('btn-limpiar-filtros-dashboard').addEventListener('click', () => {
        document.getElementById('periodo-dashboard').value = '';
        document.getElementById('especialidad-dashboard').value = '';
        estado.filtros = { periodo: '', especialidad: '' };
        cargarIndicadores(true);
        announce('Filtros de los indicadores restablecidos.', 'polite');
    });

    document.getElementById('btn-recargar-citas-admin').addEventListener('click', () => cargarCitas(true));
    document.getElementById('btn-recargar-usuarios').addEventListener('click', () => cargarUsuarios(true));
    document.getElementById('btn-recargar-hospitales').addEventListener('click', () => cargarHospitales(true));
    document.getElementById('btn-recargar-medicamentos').addEventListener('click', () => cargarMedicamentos(true));
    document.getElementById('btn-recargar-horarios-admin').addEventListener('click', () => cargarHorariosAdmin(true));

    document.getElementById('cuerpo-citas-admin').addEventListener('click', (event) => {
        const boton = event.target.closest('button[data-accion="cancelar"]');
        if (!boton) return;
        const cita = estado.citas.find((item) => Number(item.id) === Number(boton.dataset.id));
        if (cita) abrirCancelar(cita);
    });

    document.getElementById('staff-rol').addEventListener('change', actualizarCamposRol);
    document.getElementById('form-staff').addEventListener('submit', enviarStaff);
    document.getElementById('form-hospital').addEventListener('submit', enviarHospital);
    document.getElementById('form-medicamento').addEventListener('submit', enviarMedicamento);
    document.getElementById('form-horario-admin').addEventListener('submit', enviarHorarioAdmin);
    document.getElementById('form-cancelar-dashboard').addEventListener('submit', enviarCancelacion);

    document.querySelectorAll('[data-cerrar-dialog]').forEach((boton) => {
        boton.addEventListener('click', () => {
            const dialogo = document.getElementById(boton.dataset.cerrarDialog);
            if (dialogo) dialogo.close();
        });
    });

    const dialogo = document.getElementById('dlg-cancelar-dashboard');
    dialogo.addEventListener('click', (event) => {
        if (event.target === dialogo) dialogo.close();
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        announce('Cerrando sesión.', 'polite');
        logout();
    });
}

/**
 * Vuelve a dibujar los gráficos si cambia el modo de alto contraste.
 * @returns {void}
 */
function observarContraste() {
    let ultimoContraste = document.documentElement.classList.contains('high-contrast');
    const observador = new MutationObserver(() => {
        const actual = document.documentElement.classList.contains('high-contrast');
        if (actual === ultimoContraste) return;
        ultimoContraste = actual;
        if (estado.indicadores) renderGraficos(estado.indicadores.graficos || {});
    });
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

/**
 * Inicializa el dashboard administrativo.
 * @returns {Promise<void>}
 */
async function iniciar() {
    const usuario = requireRole(['ADMIN']);
    if (!usuario) {
        return;
    }
    estado.usuario = usuario;

    initAccessibility();
    initDashboardTabs();

    document.getElementById('chip-usuario').textContent = estado.usuario.nombres;
    actualizarCamposRol();
    conectarEventos();
    observarContraste();

    await cargarCatalogos();
    await cargarMedicosParaHorarios();
    await Promise.all([
        cargarIndicadores(false),
        cargarCitas(false),
        cargarUsuarios(false),
        cargarHospitales(false),
        cargarMedicamentos(false),
        cargarHorariosAdmin(false)
    ]);
    announce(`Dashboard administrativo cargado. Bienvenido, ${estado.usuario.nombres}.`, 'polite');
}

iniciar();