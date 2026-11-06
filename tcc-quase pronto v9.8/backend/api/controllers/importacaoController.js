const service = require('../services/importacaoHorarios/importacaoService');
const { ErroImportacao } = require('../services/importacaoHorarios/erros');

function responderErro(res, err) {
  if (err instanceof ErroImportacao) {
    const corpo = { error: err.message, etapa: err.etapa, codigo: err.codigo };
    if (err.detalhes !== undefined) corpo.detalhes = err.detalhes;
    return res.status(err.status).json(corpo);
  }
  console.error('[importacao] erro não tratado:', err && (err.code || err.message));
  return res.status(500).json({ error: 'Erro interno', etapa: 'comunicacao_servicos', codigo: 'ERRO_INESPERADO' });
}

function idDaRota(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErroImportacao('Identificador inválido.', { codigo: 'ID_INVALIDO', status: 400 });
  return id;
}

async function enviar(req, res) {
  try {
    if (!req.file) throw new ErroImportacao('Selecione um arquivo PDF.', { etapa: 'envio_arquivo', codigo: 'SEM_ARQUIVO' });
    const { id } = await service.iniciar({ buffer: req.file.buffer, nomeOriginal: req.file.originalname, usuarioId: req.usuario.id });
    return res.status(202).json({ id, status: 'processando' });
  } catch (err) { return responderErro(res, err); }
}
async function listar(req, res) {
  try { return res.json(await service.listar()); } catch (err) { return responderErro(res, err); }
}
async function status(req, res) {
  try { return res.json(await service.obterStatus(idDaRota(req))); } catch (err) { return responderErro(res, err); }
}
async function preview(req, res) {
  try { return res.json(await service.obterPreview(idDaRota(req))); } catch (err) { return responderErro(res, err); }
}
async function confirmar(req, res) {
  try { return res.json({ ok: true, resultado: await service.confirmar(idDaRota(req), req.body) }); }
  catch (err) { return responderErro(res, err); }
}
async function cancelar(req, res) {
  try { await service.cancelar(idDaRota(req)); return res.json({ ok: true }); } catch (err) { return responderErro(res, err); }
}

async function ambiente(req, res) {
  try { return res.json(await service.ambiente()); } catch (err) { return responderErro(res, err); }
}

module.exports = { ambiente, enviar, listar, status, preview, confirmar, cancelar, responderErro };
