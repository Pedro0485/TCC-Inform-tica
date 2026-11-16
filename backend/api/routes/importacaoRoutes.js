// Rotas da importação de horários (somente coordenadora).
//   GET    /importacoes/ambiente                 o servidor está pronto para ler PDFs? (Python, bibliotecas, Tesseract)
//   POST   /importacoes/horarios                 envia o PDF (multipart, campo "arquivo") -> 202 {id}
//   GET    /importacoes/horarios                 histórico
//   GET    /importacoes/horarios/:id             andamento (etapa, progresso, erro)
//   GET    /importacoes/horarios/:id/preview     leitura para conferência
//   POST   /importacoes/horarios/:id/confirmar   grava (corpo = correções da coordenadora)
//   POST   /importacoes/horarios/:id/cancelar
const express = require('express');
const multer = require('multer');
const path = require('path');
const cfg = require('../config/importacaoConfig');
const { verificarToken, apenasCoordenadora } = require('../middlewares/authMiddleware');
const auditoriaAtividade = require('../services/auditoriaAtividade');
const ctrl = require('../controllers/importacaoController');
const gabaritoCtrl = require('../controllers/gabaritoController');
const { ErroImportacao } = require('../services/importacaoHorarios/erros');

const router = express.Router();

// O PDF fica em memória (nenhum arquivo é criado com nome vindo do usuário).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: cfg.TAMANHO_MAX_BYTES, files: 1, fields: 5, parts: 8 },
  fileFilter: (req, file, cb) => {
    // triagem barata; a validação de verdade (bytes) é feita no service
    if (path.extname(file.originalname || '').toLowerCase() !== '.pdf') {
      return cb(new ErroImportacao('Envie um arquivo com extensão .pdf.', { etapa: 'envio_arquivo', codigo: 'EXTENSAO_INVALIDA', status: 415 }));
    }
    return cb(null, true);
  },
}).single('arquivo');

function receberPdf(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ErroImportacao) return ctrl.responderErro(res, err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return ctrl.responderErro(res, new ErroImportacao(
        `O PDF é maior que o limite de ${Math.round(cfg.TAMANHO_MAX_BYTES / 1024 / 1024)} MB.`,
        { etapa: 'envio_arquivo', codigo: 'ARQUIVO_GRANDE_DEMAIS', status: 413 }));
    }
    return ctrl.responderErro(res, new ErroImportacao('Não foi possível receber o arquivo.', { etapa: 'envio_arquivo', codigo: 'ENVIO_INVALIDO' }));
  });
}

// Este router é montado ANTES do express.json() global (limite de 100 KB), por isso define o seu.
router.use(express.json({ limit: '2mb' }));
router.use(verificarToken, apenasCoordenadora, auditoriaAtividade.middleware);

router.get('/ambiente', ctrl.ambiente);
router.get('/gabarito', gabaritoCtrl.listar);
router.post('/gabarito', gabaritoCtrl.criar);
router.put('/gabarito/:id', gabaritoCtrl.atualizar);
router.delete('/gabarito/:id', gabaritoCtrl.desativar);
router.post('/horarios', receberPdf, ctrl.enviar);
router.get('/horarios', ctrl.listar);
router.get('/horarios/:id', ctrl.status);
router.get('/horarios/:id/preview', ctrl.preview);
router.post('/horarios/:id/confirmar', ctrl.confirmar);
router.post('/horarios/:id/cancelar', ctrl.cancelar);

module.exports = router;
