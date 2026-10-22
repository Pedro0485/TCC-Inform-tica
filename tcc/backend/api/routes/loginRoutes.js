const express = require('express');

const router = express.Router();

const turmaController = require('../controllers/turmaController');

// Rota pública - aluno acessa a turma com nome + ano + código
router.post('/turma', turmaController.loginTurma);

// Rota pública - lista os cursos cadastrados para o select do login
router.get('/cursos', turmaController.listarCursosPublico);

module.exports = router;
