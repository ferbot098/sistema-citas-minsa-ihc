import { citaService } from '../services/citaService.js';
export class CitaController {
    async getHospitales(req, res) {
        try {
            const data = await citaService.getHospitales();
            res.status(200).json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async postHospital(req, res) {
        try {
            const hospital = await citaService.registrarHospital(req.body || {});
            res.status(201).json({ mensaje: 'Establecimiento de salud registrado', hospital });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
    async getMedicos(req, res) {
        try {
            const data = await citaService.getMedicosYHorarios({
                hospitalId: req.query.hospitalId ? Number(req.query.hospitalId) : undefined,
                especialidadId: req.query.especialidadId ? Number(req.query.especialidadId) : undefined
            });
            res.status(200).json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async postCita(req, res) {
        try {
            const cita = await citaService.reservarCita(req.user, req.body);
            res.status(201).json({ mensaje: 'Su cita fue confirmada', cita });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
    async getCitas(req, res) {
        try {
            const data = await citaService.listarCitasPorRol(req.user);
            res.status(200).json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async patchReprogramar(req, res) {
        try {
            const cita = await citaService.reprogramarCita(req.user, Number(req.params.id), req.body);
            res.status(200).json({ mensaje: 'Cita reprogramada exitosamente', cita });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
    async patchCancelar(req, res) {
        try {
            const cita = await citaService.cancelarCita(req.user, Number(req.params.id), req.body?.motivo);
            res.status(200).json({ mensaje: 'Cita cancelada y horario liberado', cita });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
    async patchAtender(req, res) {
        try {
            const cita = await citaService.registrarAtencionClinica(
                req.user,
                Number(req.params.id),
                req.body?.estado,
                req.body?.observacion
            );
            res.status(200).json({ mensaje: 'Estado clínico actualizado', cita });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
    async postHorario(req, res) {
        try {
            const horario = await citaService.publicarHorario(req.user, req.body);
            res.status(201).json({ mensaje: 'Bloque horario habilitado', horario });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}
export const citaController = new CitaController();
