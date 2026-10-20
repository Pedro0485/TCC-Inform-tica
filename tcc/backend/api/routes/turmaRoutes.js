const express = require('express');

const router = express.Router();

const turmaController = require('../controllers/turmaController');
const { verificarToken, apenasCoordenadora, verificarChaveInterna } = require('../middlewares/authMiddleware');
const { uploadHorarios } = require('../middlewares/uploadMiddleware');

// Rota interna chamada pelo script Python (não é acessada por usuário logado no
// navegador, então usa uma chave interna em vez do JWT de coordenadora)
router.post('/horarios-lidos', verificarChaveInterna, turmaController.salvarHorariosLidos);

// Daqui pra baixo, todas as rotas de turmas exigem token válido e perfil de coordenadora (admin = 1)
router.use(verificarToken, apenasCoordenadora);

router.post('/', turmaController.criarTurma);
router.get('/', turmaController.listarTurmas);
router.get('/:id', turmaController.buscarTurma);
router.put('/:id', turmaController.atualizarTurma);
router.delete('/:id', turmaController.deletarTurma);

// Grava (substitui) os horários de uma turma específica — usado ao criar a turma individualmente
router.put('/:id/horarios', turmaController.salvarHorariosTurma);

// Upload do arquivo de horários (PDF/XLS/XLSX/CSV) — salva em backend/uploads/horarios
router.post('/upload-horarios', uploadHorarios.single('arquivo'), turmaController.uploadHorarios);

module.exports = router;