const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/eventoController');
const { verificarToken, apenasCoordenadora } = require('../middlewares/authMiddleware');

router.get('/', verificarToken, ctrl.listar);
router.post('/', verificarToken, apenasCoordenadora, ctrl.criar);
router.put('/:id', verificarToken, apenasCoordenadora, ctrl.atualizar);
router.delete('/:id', verificarToken, apenasCoordenadora, ctrl.excluir);

module.exports = router;
