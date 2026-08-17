const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificacaoController');
const { verificarToken, apenasCoordenadora } = require('../middlewares/authMiddleware');

router.get('/', verificarToken, ctrl.listar);
router.post('/marcar-todas-lidas', verificarToken, ctrl.marcarTodasLidas);
router.post('/', verificarToken, apenasCoordenadora, ctrl.criar);
module.exports = router;
