'use strict';
const express=require('express');
const {verificarToken,apenasCoordenadora}=require('../middlewares/authMiddleware');
const ctrl=require('../controllers/administracaoDadosController');
const r=express.Router();r.use(verificarToken,apenasCoordenadora);r.get('/contagens',ctrl.contagens);r.get('/backup',ctrl.backup);r.get('/atividade-recente',ctrl.atividadeRecente);r.post('/excluir',ctrl.excluir);module.exports=r;
