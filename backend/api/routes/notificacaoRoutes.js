const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificacaoController');
const { verificarToken, apenasCoordenadora } = require('../middlewares/authMiddleware');

router.get('/', verificarToken, ctrl.listar);
router.post('/marcar-todas-lidas', verificarToken, ctrl.marcarTodasLidas);
router.post('/:id/lida', verificarToken, ctrl.marcarLida);
router.post('/', verificarToken, apenasCoordenadora, ctrl.criar);
router.delete('/:id', verificarToken, apenasCoordenadora, ctrl.excluir);
module.exports = router;
