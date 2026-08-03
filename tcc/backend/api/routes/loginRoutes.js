const express = require('express');

const router = express.Router();

const turmaController = require('../controllers/turmaController');

// Rota pública - aluno acessa a turma com nome + ano + código
router.post('/turma', turmaController.loginTurma);

module.exports = router;
