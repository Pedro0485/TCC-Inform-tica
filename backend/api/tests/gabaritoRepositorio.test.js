'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chave, preparar } = require('../services/importacaoHorarios/gabaritoRepositorio');

test('normaliza gabarito ignorando acentos, caixa e pontuação/espaços', () => {
  assert.equal(chave('  Nídia   Vieira '), 'NIDIAVIEIRA');
  assert.equal(chave('NIDIA VIEIRA'), 'NIDIAVIEIRA');
});

test('prepara entidade com variações normalizadas e remove duplicadas', () => {
  const entrada = preparar({ tipo: 'professor', nome_oficial: 'Nídia Vieira', variacoes: ['Nidia V.', 'NIDIA V.'] });
  assert.equal(entrada.chave, 'NIDIAVIEIRA');
  assert.deepEqual(entrada.variacoes.map((v) => v.texto), ['Nidia V.']);
  assert.equal(entrada.ativo, 1);
});

test('rejeita tipo, nome e variação inválidos', () => {
  assert.throws(() => preparar({ tipo: 'aula', nome_oficial: 'Matemática' }), { codigo: 'GABARITO_INVALIDO' });
  assert.throws(() => preparar({ tipo: 'disciplina', nome_oficial: '<script>' }), { codigo: 'GABARITO_INVALIDO' });
  assert.throws(() => preparar({ tipo: 'disciplina', nome_oficial: 'Matemática', variacoes: ['!!!'] }), { codigo: 'GABARITO_INVALIDO' });
});
