'use strict';

const pool = require('../config/db');
const gabarito = require('../services/importacaoHorarios/gabaritoRepositorio');
const { ErroImportacao, ETAPAS } = require('../services/importacaoHorarios/erros');

function responder(res, err) {
  if (err instanceof ErroImportacao) return res.status(err.status).json({ error: err.message, etapa: err.etapa, codigo: err.codigo });
  console.error('[gabarito] falha:', err && (err.code || err.message));
  const migracaoPendente = err && err.code === 'ER_NO_SUCH_TABLE';
  return res.status(migracaoPendente ? 503 : 500).json({
    error: migracaoPendente ? 'O banco ainda não tem o gabarito. Execute npm run db:migrate.' : 'Não foi possível acessar o gabarito.',
    etapa: ETAPAS.GRAVACAO, codigo: migracaoPendente ? 'MIGRACAO_GABARITO_PENDENTE' : 'ERRO_GABARITO',
  });
}

async function listar(req, res) {
  try { return res.json({ itens: await gabarito.listar(pool) }); }
  catch (err) { return responder(res, err); }
}

async function criar(req, res) {
  try { return res.status(201).json({ item: await gabarito.salvar(pool, req.body) }); }
  catch (err) { return responder(res, err); }
}

async function atualizar(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Identificador inválido.' });
  try { return res.json({ item: await gabarito.salvar(pool, req.body, id) }); }
  catch (err) { return responder(res, err); }
}

async function desativar(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Identificador inválido.' });
  try { await gabarito.desativar(pool, id); return res.json({ ok: true }); }
  catch (err) { return responder(res, err); }
}

module.exports = { listar, criar, atualizar, desativar };
