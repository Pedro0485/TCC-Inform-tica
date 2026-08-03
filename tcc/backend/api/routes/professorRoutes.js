const express = require('express');

const router = express.Router();

const professorController = require('../controllers/professorController');
const { verificarToken, apenasCoordenadora } = require('../middlewares/authMiddleware');

// Rota pública - login do professor
router.post('/login', professorController.login);

// A partir daqui, todas as rotas exigem token válido e perfil de coordenadora (admin = 1)
router.use(verificarToken, apenasCoordenadora);

router.post('/', professorController.criarProfessor);
router.get('/', professorController.listarProfessores);
router.get('/:id', professorController.buscarProfessor);
router.put('/:id', professorController.atualizarProfessor);
router.delete('/:id', professorController.deletarProfessor);

module.exports = router;
