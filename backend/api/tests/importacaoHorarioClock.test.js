'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { instante } = require('../services/importacaoHorarios/log');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-clock-only';
const { verificarToken } = require('../middlewares/authMiddleware');
const repositorio = require('../services/importacaoHorarios/repositorio');

const segredo = 'test-secret-for-clock-only';
function executarAuth(token) {
  let chamado = false;
  const req = { headers: { authorization: `Bearer ${token}` }, originalUrl: '/importacoes/horarios', method: 'POST' };
  const res = { statusCode: null, status(n) { this.statusCode = n; return this; }, json() { return this; } };
  verificarToken(req, res, () => { chamado = true; });
  return { chamado, status: res.statusCode };
}

test('mesmo instante UTC mantém epoch estável em TZ diurno e noturno', () => {
  const original = process.env.TZ;
  try {
    const instant = new Date('2026-11-14T22:30:00.000Z');
    process.env.TZ = 'America/Sao_Paulo';
    const noite = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23' }).format(instant);
    const utcNoite = instant.toISOString();
    process.env.TZ = 'Pacific/Kiritimati';
    const dia = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23' }).format(instant);
    assert.notEqual(noite, dia, 'os relógios locais diferem para o mesmo instante');
    assert.equal(instant.toISOString(), utcNoite, 'o instante UTC não depende do fuso');
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});

test('JWT válido é aceito independentemente do fuso local do servidor', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalTz = process.env.TZ;
  process.env.JWT_SECRET = segredo;
  try {
    const token = jwt.sign({ id: 7, tipo: 'professor', admin: true }, segredo, { expiresIn: '1h' });
    for (const tz of ['America/Sao_Paulo', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      assert.deepEqual(executarAuth(token), { chamado: true, status: null }, `TZ=${tz}`);
    }
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
    if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
  }
});

test('JWT expirado é recusado em qualquer horário local', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalTz = process.env.TZ;
  process.env.JWT_SECRET = segredo;
  try {
    const token = jwt.sign({ id: 7, tipo: 'professor', admin: true, exp: Math.floor(Date.now() / 1000) - 60 }, segredo);
    for (const tz of ['America/Sao_Paulo', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      assert.deepEqual(executarAuth(token), { chamado: false, status: 401 }, `TZ=${tz}`);
    }
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
    if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
  }
});

test('importação diurna aceita sessão de 8h e a mesma sessão expira à noite', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalNow = Date.now;
  process.env.JWT_SECRET = segredo;
  try {
    const base = Math.floor(Date.parse('2026-11-14T09:00:00Z') / 1000);
    const token = jwt.sign({ id: 7, tipo: 'professor', admin: true, iat: base, exp: base + 8 * 3600 }, segredo);
    Date.now = () => base * 1000;
    assert.equal(executarAuth(token).chamado, true);
    Date.now = () => (base + 13 * 3600) * 1000;
    assert.deepEqual(executarAuth(token), { chamado: false, status: 401 });
  } finally {
    Date.now = originalNow;
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
  }
});

test('diagnóstico inclui UTC e timezone local sem expor payloads', () => {
  const data = instante();
  assert.match(data.utc, /^\d{4}-\d\d-\d\dT.*Z$/);
  assert.ok(data.timezone_configurado);
  assert.ok(data.servidor_local);
});

test('slots de OCR usam mutex MySQL compartilhável e liberam a conexão quando ocupados', async () => {
  let tentativas = 0;
  let released = 0;
  const conn = {
    async query(sql, params) { tentativas++; return [[{ adquirido: params && params[0] === 'importacao_pdf_ocr_1' ? 1 : 0 }]]; },
    release() { released++; },
  };
  const slot = await repositorio.adquirirSlotProcessamento({ getConnection: async () => conn }, 2);
  assert.equal(slot.nome, 'importacao_pdf_ocr_1');
  assert.equal(tentativas, 2);
  await repositorio.liberarSlotProcessamento(slot);
  assert.equal(released, 1);

  tentativas = 0;
  const ocupado = await repositorio.adquirirSlotProcessamento({ getConnection: async () => ({
    async query() { tentativas++; return [[{ adquirido: 0 }]]; },
    release() { released++; },
  }) }, 2);
  assert.equal(ocupado, null);
  assert.equal(tentativas, 2);
  assert.equal(released, 2);
});
