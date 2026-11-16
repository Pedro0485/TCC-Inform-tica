// Testes de lógica pura (sem banco): siglas das turmas criadas pela importação.
const test = require('node:test');
const assert = require('node:assert/strict');
const { nomeCurto, aplicarNomesCurtos } = require('../services/importacaoHorarios/nomesCurtos');
const { turma, leitura } = require('./helpers');

test('reconhece cada curso pelo título do PDF', () => {
  for (const [titulo, esperado] of [
    ['Mecatrônica', 'meca'], ['Mtec - Mecatrônica - Bariri', 'meca'],
    ['Informática', 'info'], ['Mtec - PI - INFORMÁTICA', 'info'],
    ['Administração - Bariri', 'adm'],
    ['Mtec - PI - EDIFICAÇÕES', 'edf'], ['Edificações', 'edf'],
    ['Desenvolvimento de Sistemas', 'dse'], ['Marketing', 'mkt'],
  ]) assert.equal(nomeCurto(titulo), esperado, titulo);
  assert.equal(nomeCurto('Recursos Humanos'), null);
});

test('turma nova recebe a sigla; o ano continua separado e o nome do PDF fica guardado', () => {
  const d = leitura([turma(1, '1º Administração - Bariri', 1, 'Administração - Bariri', []),
    turma(2, '3º Mecatrônica', 3, 'Mecatrônica', [])]);
  aplicarNomesCurtos(d, []);
  assert.deepEqual(d.turmas.map((t) => [t.ano, t.nome]), [[1, 'adm'], [3, 'meca']]);
  assert.equal(d.turmas[0].nome_pdf, 'Administração - Bariri');
});

test('turma já cadastrada com o nome antigo continua sendo reaproveitada', () => {
  const d = leitura([turma(1, '1º Administração', 1, 'Administração', [])]);
  aplicarNomesCurtos(d, [{ nome: 'administração', ano: 1 }]);
  assert.equal(d.turmas[0].nome, 'Administração');
});

test('curso desconhecido mantém o nome do PDF', () => {
  const d = leitura([turma(1, '1º Recursos Humanos', 1, 'Recursos Humanos', [])]);
  aplicarNomesCurtos(d, []);
  assert.equal(d.turmas[0].nome, 'Recursos Humanos');
});
