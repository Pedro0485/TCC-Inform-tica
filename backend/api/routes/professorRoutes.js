const express = require('express');

const router = express.Router();

const professorController = require('../controllers/professorController');
const { verificarToken, apenasProfessor, apenasCoordenadora } = require('../middlewares/authMiddleware');
const { limitarTentativasLogin } = require('../middlewares/loginRateLimit');

// Rota pública - login do professor
router.post('/login', limitarTentativasLogin('professor'), professorController.login);

// Perfil do usuário logado (qualquer professor ou coordenadora) — só precisa de token,
// não precisa ser coordenadora, já que cada um só mexe nos próprios dados
router.get('/me', verificarToken, apenasProfessor, professorController.meuPerfil);
router.put('/me', verificarToken, apenasProfessor, professorController.atualizarMeuPerfil);

// Aulas do professor autenticado (somente as dele)
router.get('/me/aulas', verificarToken, apenasProfessor, professorController.minhasAulas);

// A partir daqui, todas as rotas exigem token válido e perfil de coordenadora (admin = 1)
router.use(verificarToken, apenasCoordenadora);

router.post('/', professorController.criarProfessor);
router.get('/', professorController.listarProfessores);
router.get('/:id', professorController.buscarProfessor);
router.put('/:id', professorController.atualizarProfessor);
router.delete('/:id', professorController.deletarProfessor);

module.exports = router;
