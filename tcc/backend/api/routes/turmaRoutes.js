const express = require('express');

const router = express.Router();

const turmaController = require('../controllers/turmaController');
const { verificarToken, apenasCoordenadora, verificarChaveInterna } = require('../middlewares/authMiddleware');
const { uploadHorarios } = require('../middlewares/uploadMiddleware');

// Rota interna chamada pelo script Python (não é acessada por usuário logado no
// navegador, então usa uma chave interna em vez do JWT de coordenadora)
router.post('/horarios-lidos', verificarChaveInterna, turmaController.salvarHorariosLidos);

// Aulas da turma logada (aluno): usa o id da turma do próprio token
router.get('/me/aulas', verificarToken, (req, res, next) => {
  if (!req.usuario || req.usuario.tipo !== 'turma') {
    return res.status(403).json({ error: 'Acesso restrito a alunos' });
  }
  return next();
}, turmaController.minhasAulasTurma);

// Daqui pra baixo, todas as rotas de turmas exigem token válido e perfil de coordenadora (admin = 1)
router.use(verificarToken, apenasCoordenadora);

router.put('/materias/renomear', turmaController.renomearMateria);
router.get('/materias/professores', turmaController.listarProfessoresMaterias);
router.put('/materias/professores', turmaController.definirProfessoresMateria);
router.delete('/materias/professores', turmaController.removerProfessoresMateria);
router.get('/horarios', turmaController.listarHorariosTurmas);
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