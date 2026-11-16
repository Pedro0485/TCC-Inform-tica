'use strict';

const { ErroImportacao, ETAPAS } = require('./erros');

function chave(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function textoSeguro(valor, rotulo) {
  if (typeof valor !== 'string') throw erro(`${rotulo} inválido.`, 'GABARITO_INVALIDO');
  const texto = valor.trim().replace(/\s+/g, ' ');
  if (!texto || texto.length > 150 || /[<>\u0000-\u001f\u007f]/.test(texto)) {
    throw erro(`${rotulo} vazio, longo demais ou contém caracteres inválidos.`, 'GABARITO_INVALIDO');
  }
  return texto;
}

function erro(mensagem, codigo, status = 422) {
  return new ErroImportacao(mensagem, { etapa: ETAPAS.VALIDACAO, codigo, status });
}

function preparar(body) {
  const tipo = body && body.tipo;
  if (!['professor', 'disciplina'].includes(tipo)) throw erro('Tipo deve ser professor ou disciplina.', 'GABARITO_INVALIDO');
  const nome = textoSeguro(body.nome_oficial, 'Nome oficial');
  const variacoesIn = body.variacoes === undefined ? [] : body.variacoes;
  if (!Array.isArray(variacoesIn) || variacoesIn.length > 50) throw erro('Informe até 50 variações.', 'GABARITO_INVALIDO');
  const variacoes = [];
  const keys = new Set([chave(nome)]);
  for (const v of variacoesIn) {
    const variacao = textoSeguro(v, 'Variação');
    const k = chave(variacao);
    if (!k) throw erro('Variação sem letras ou números.', 'GABARITO_INVALIDO');
    if (!keys.has(k)) { keys.add(k); variacoes.push({ texto: variacao, chave: k }); }
  }
  if (!chave(nome)) throw erro('Nome oficial sem letras ou números.', 'GABARITO_INVALIDO');
  return { tipo, nome, chave: chave(nome), variacoes, ativo: body.ativo === undefined ? 1 : (body.ativo ? 1 : 0) };
}

async function comLock(conn, executar) {
  let lock = false;
  try {
    const [[r]] = await conn.query("SELECT GET_LOCK('gabarito_entidades_write', 10) AS adquirido");
    lock = Number(r.adquirido) === 1;
    if (!lock) throw erro('O gabarito está sendo atualizado por outra solicitação. Tente novamente.', 'GABARITO_OCUPADO', 409);
    await conn.beginTransaction();
    const result = await executar();
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* sem transação ativa ou conexão perdida */ }
    if (err.code === 'ER_DUP_ENTRY') throw erro('Esse nome ou variação já está cadastrado para este tipo.', 'GABARITO_DUPLICADO', 409);
    throw err;
  } finally {
    if (lock) {
      try { await conn.query("SELECT RELEASE_LOCK('gabarito_entidades_write')"); } catch (_) { /* conexão pode ter caído */ }
    }
  }
}

async function chavesEmUso(conn, tipo, chaves, ignorarId = 0) {
  for (const k of chaves) {
    const [entidades] = await conn.query('SELECT id FROM gabarito_entidades WHERE tipo = ? AND chave_normalizada = ? AND id <> ? LIMIT 1', [tipo, k, ignorarId]);
    const [variacoes] = await conn.query('SELECT entidade_id AS id FROM gabarito_variacoes WHERE tipo = ? AND chave_normalizada = ? AND entidade_id <> ? LIMIT 1', [tipo, k, ignorarId]);
    if (entidades.length || variacoes.length) throw erro('Esse nome ou variação já está associado a outra entrada do gabarito.', 'GABARITO_DUPLICADO', 409);
  }
}

async function listar(pool, { incluirInativos = true } = {}) {
  const filtro = incluirInativos ? '' : 'WHERE e.ativo = 1';
  const [rows] = await pool.query(`SELECT e.id, e.tipo, e.nome_oficial, e.ativo, e.origem,
      e.criado_em, e.atualizado_em, v.variacao
    FROM gabarito_entidades e LEFT JOIN gabarito_variacoes v ON v.entidade_id = e.id
    ${filtro} ORDER BY e.tipo, e.nome_oficial, v.variacao`);
  const porId = new Map();
  for (const row of rows) {
    if (!porId.has(row.id)) porId.set(row.id, { id: row.id, tipo: row.tipo, nome_oficial: row.nome_oficial,
      ativo: !!row.ativo, origem: row.origem, criado_em: row.criado_em, atualizado_em: row.atualizado_em, variacoes: [] });
    if (row.variacao) porId.get(row.id).variacoes.push(row.variacao);
  }
  return [...porId.values()];
}

async function salvar(pool, body, id = null) {
  const entrada = preparar(body || {});
  const conn = await pool.getConnection();
  try {
    return await comLock(conn, async () => {
      let atual = null;
      if (id !== null) {
        const [rows] = await conn.query('SELECT id FROM gabarito_entidades WHERE id = ? FOR UPDATE', [id]);
        if (!rows.length) throw erro('Entrada do gabarito não encontrada.', 'GABARITO_NAO_ENCONTRADO', 404);
        atual = rows[0];
      }
      await chavesEmUso(conn, entrada.tipo, [entrada.chave, ...entrada.variacoes.map((v) => v.chave)], id || 0);
      let entidadeId = id;
      if (atual) {
        await conn.query('UPDATE gabarito_entidades SET tipo = ?, nome_oficial = ?, chave_normalizada = ?, ativo = ?, origem = \'manual\' WHERE id = ?',
          [entrada.tipo, entrada.nome, entrada.chave, entrada.ativo, id]);
        await conn.query('DELETE FROM gabarito_variacoes WHERE entidade_id = ?', [id]);
      } else {
        const [r] = await conn.query('INSERT INTO gabarito_entidades (tipo, nome_oficial, chave_normalizada, ativo, origem) VALUES (?, ?, ?, ?, \'manual\')',
          [entrada.tipo, entrada.nome, entrada.chave, entrada.ativo]);
        entidadeId = r.insertId;
      }
      for (const v of entrada.variacoes) {
        await conn.query('INSERT INTO gabarito_variacoes (entidade_id, tipo, variacao, chave_normalizada) VALUES (?, ?, ?, ?)',
          [entidadeId, entrada.tipo, v.texto, v.chave]);
      }
      return { id: entidadeId, ...entrada, variacoes: entrada.variacoes.map((v) => v.texto) };
    });
  } finally { conn.release(); }
}

async function desativar(pool, id) {
  const [r] = await pool.query('UPDATE gabarito_entidades SET ativo = 0 WHERE id = ?', [id]);
  if (!r.affectedRows) throw erro('Entrada do gabarito não encontrada.', 'GABARITO_NAO_ENCONTRADO', 404);
}

async function carregarParaOCR(pool) {
  const [rows] = await pool.query(`SELECT e.id, e.tipo, e.nome_oficial, v.variacao
    FROM gabarito_entidades e LEFT JOIN gabarito_variacoes v ON v.entidade_id = e.id
    WHERE e.ativo = 1 ORDER BY e.tipo, e.id, v.id`);
  const grupos = new Map();
  for (const r of rows) {
    if (!grupos.has(r.id)) grupos.set(r.id, { id: r.id, tipo: r.tipo, nome_oficial: r.nome_oficial, variacoes: [] });
    if (r.variacao) grupos.get(r.id).variacoes.push(r.variacao);
  }
  const entradas = [...grupos.values()];
  const [correcoesExatas] = await pool.query(`SELECT texto_origem, texto_corrigido
    FROM gabarito_correcoes_exatas WHERE tipo = 'disciplina' AND ativo = 1 ORDER BY id`);
  return { professores: entradas.filter((e) => e.tipo === 'professor').map(({ tipo, ...e }) => e),
    disciplinas: entradas.filter((e) => e.tipo === 'disciplina').map(({ tipo, ...e }) => e),
    correcoes_exatas: correcoesExatas };
}

module.exports = { chave, preparar, listar, salvar, desativar, carregarParaOCR };
