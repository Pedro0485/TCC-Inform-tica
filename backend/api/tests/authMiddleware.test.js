'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const segredoOriginal = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'test-secret-for-current-role-check';
const pool = require('../config/db');
const { apenasCoordenadora } = require('../middlewares/authMiddleware');

test.after(() => {
  if (segredoOriginal === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = segredoOriginal;
});

async function checarPermissao(payload, adminAtual) {
  const queryOriginal = pool.query;
  let consultouBanco = false;
  let chamouNext = false;
  let status = null;
  pool.query = async (sql, params) => {
    consultouBanco = true;
    assert.match(sql, /SELECT admin FROM professores/);
    assert.deepEqual(params, [payload.id]);
    return [[{ admin: adminAtual }]];
  };
  const req = { usuario: jwt.verify(jwt.sign(payload, process.env.JWT_SECRET), process.env.JWT_SECRET) };
  const res = { status(n) { status = n; return this; }, json() { return this; } };
  try {
    await apenasCoordenadora(req, res, () => { chamouNext = true; });
  } finally {
    pool.query = queryOriginal;
  }
  return { consultouBanco, chamouNext, status };
}

test('revogação de coordenadora no banco bloqueia token antigo ainda válido', async () => {
  assert.deepEqual(await checarPermissao({ id: 42, tipo: 'professor', admin: true }, 0), {
    consultouBanco: true, chamouNext: false, status: 403,
  });
});

test('permissão atual no banco é aplicada mesmo se a claim antiga divergir', async () => {
  assert.deepEqual(await checarPermissao({ id: 42, tipo: 'professor', admin: false }, 1), {
    consultouBanco: true, chamouNext: true, status: null,
  });
});

test('token de turma não alcança a consulta de permissões de professor', async () => {
  const queryOriginal = pool.query;
  pool.query = async () => { throw new Error('consulta inesperada'); };
  let status = null;
  try {
    await apenasCoordenadora({ usuario: { id: 42, tipo: 'turma', admin: true } }, {
      status(n) { status = n; return this; }, json() { return this; },
    }, () => assert.fail('token de turma não deve avançar'));
  } finally {
    pool.query = queryOriginal;
  }
  assert.equal(status, 403);
});
