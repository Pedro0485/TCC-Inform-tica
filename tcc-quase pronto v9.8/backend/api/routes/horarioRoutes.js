const express = require('express');
const { verificarToken } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/horarioController');

const router = express.Router();
router.use(verificarToken);                       // qualquer usuário logado; a regra fina fica no controller
router.get('/turma/:id', ctrl.porTurma);
router.get('/professor/:id', ctrl.porProfessor);

module.exports = router;
