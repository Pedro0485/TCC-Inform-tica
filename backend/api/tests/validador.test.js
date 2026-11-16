// Testes de lógica pura (sem banco): validação da saída do Python e plano de gravação.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validarSaidaPython, montarPlano } = require('../services/importacaoHorarios/validadorDados');
const { chaveNome, chaveTurma } = require('../services/importacaoHorarios/texto');
const { aula, turma, leitura } = require('./helpers');

const ctxVazio = { chaveTurma, turmasPorChave: new Map(), turmasPorId: new Map(), criarNovas: true };
const base = () => leitura([turma(1, '1º Administração', 1, 'Administração', [
  aula('segunda', '19:00', '19:50', 'Matemática', ['Ana Silva']),
  aula('segunda', '19:50', '20:40', 'Matemática', ['Ana Silva'], { linha: 1 })])]);

test('estrutura válida é aceita', () => assert.ok(validarSaidaPython(base())));

for (const [nome, mutar] of [
  ['versão desconhecida', (d) => { d.versao_esquema = 2; }],
  ['dia da semana inválido', (d) => { d.turmas[0].aulas[0].dia_semana = 'domingo'; }],
  ['horário mal formado', (d) => { d.turmas[0].aulas[0].hora_inicio = '25:99'; }],
  ['professores não é lista', (d) => { d.turmas[0].aulas[0].professores = 'Ana'; }],
  ['ano fora de 1-3', (d) => { d.turmas[0].ano = 7; }],
  ['campo ausente (origem)', (d) => { delete d.turmas[0].aulas[0].origem; }],
  ['nenhuma turma', (d) => { d.turmas = []; }],
  ['página repetida', (d) => { d.turmas.push({ ...d.turmas[0] }); }],
]) {
  test(`rejeita dados com ${nome}`, () => {
    const d = base(); mutar(d);
    assert.throws(() => validarSaidaPython(d), (e) => e.etapa === 'validacao_dados');
  });
}

test('plano normal: cria turma nova com as aulas', () => {
  const { plano, bloqueios } = montarPlano(base(), {}, ctxVazio);
  assert.equal(bloqueios.length, 0);
  assert.equal(plano[0].aulas.length, 2);
  assert.deepEqual(plano[0].nova, { nome: 'Administração', ano: 1, turno: 'noturno' });
});

test('turma não cadastrada sem autorização para criar BLOQUEIA', () => {
  const { bloqueios } = montarPlano(base(), {}, { ...ctxVazio, criarNovas: false });
  assert.equal(bloqueios[0].codigo, 'TURMA_NAO_CADASTRADA');
});

test('aula marcada para revisão bloqueia até ser conferida, editada ou excluída', () => {
  const d = base(); d.turmas[0].aulas[0].requer_revisao = true; d.turmas[0].aulas[0].motivos_revisao = ['BAIXA_CONFIANCA'];
  assert.equal(montarPlano(d, {}, ctxVazio).bloqueios[0].codigo, 'REVISAO_PENDENTE');
  const k = { pagina: 1, linha: 0, coluna: 0 };
  assert.equal(montarPlano(d, { aulas: [{ ...k, conferido: true }] }, ctxVazio).bloqueios.length, 0);
  assert.equal(montarPlano(d, { aulas: [{ ...k, materia: 'Física' }] }, ctxVazio).bloqueios.length, 0);
  assert.equal(montarPlano(d, { aulas: [{ ...k, excluir: true }] }, ctxVazio).plano[0].aulas.length, 1);
});

test('horários deduzidos exigem conferência da turma (ou correção da tabela)', () => {
  const d = base(); d.turmas[0].horarios_para_conferir = true;
  assert.equal(montarPlano(d, {}, ctxVazio).bloqueios[0].codigo, 'HORARIOS_NAO_CONFERIDOS');
  assert.equal(montarPlano(d, { turmas: [{ pagina: 1, horarios_conferidos: true }] }, ctxVazio).bloqueios.length, 0);
});

test('correção da tabela de horários vale para todas as aulas da linha', () => {
  const { plano } = montarPlano(base(), { turmas: [{ pagina: 1, linhas_horario: [{ linha: 0, hora_inicio: '18:30', hora_fim: '19:20' }] }] }, ctxVazio);
  assert.equal(plano[0].aulas.find((a) => a.hora_fim === '19:20').hora_inicio, '18:30');
});

test('duas aulas no mesmo dia/horário BLOQUEIAM', () => {
  const d = base(); d.turmas[0].aulas[1].hora_inicio = '19:00';
  assert.ok(montarPlano(d, {}, ctxVazio).bloqueios.some((b) => b.codigo === 'AULA_DUPLICADA'));
});

test('renomear professor vale em todas as aulas e ignora acento/espaço na chave', () => {
  const d = base(); d.turmas[0].aulas[0].professores = ['Camilo Me Squita'];
  const { plano } = montarPlano(d, { professores: [{ nome_extraido: 'CAMILO MESQUITA', nome_final: 'Camilo Mesquita' }] }, ctxVazio);
  assert.deepEqual(plano[0].aulas[0].professores, ['Camilo Mesquita']);
});

test('nome de professor inválido na correção BLOQUEIA', () => {
  const { bloqueios } = montarPlano(base(), { professores: [{ nome_extraido: 'Ana Silva', nome_final: '12' }] }, ctxVazio);
  assert.ok(bloqueios.some((b) => b.codigo === 'NOME_PROFESSOR_INVALIDO'));
});

test('página ignorada não entra no plano nem gera bloqueio', () => {
  const d = base(); d.turmas[0].ano = null;
  const r = montarPlano(d, { turmas: [{ pagina: 1, ignorar: true }] }, ctxVazio);
  assert.deepEqual(r.ignoradas, [1]);
  assert.ok(r.bloqueios.every((b) => b.codigo === 'NADA_PARA_IMPORTAR'));
});

test('o cliente não consegue injetar aulas que não vieram do PDF', () => {
  const k = { pagina: 1, linha: 99, coluna: 99, materia: 'Aula inventada', professores: ['Fulano'] };
  const { plano } = montarPlano(base(), { aulas: [k] }, ctxVazio);
  assert.equal(plano[0].aulas.length, 2);
  assert.ok(!plano[0].aulas.some((a) => a.materia === 'Aula inventada'));
});

test('chaveNome ignora acento, caixa, espaço e pontuação', () => {
  assert.equal(chaveNome('Nídia  Vieira'), chaveNome('NIDIA VIEIRA'));
  assert.equal(chaveNome('Camilo Me Squita'), chaveNome('Camilo Mesquita'));
  assert.notEqual(chaveNome('Marcia Regina'), chaveNome('Marcia Regina Zugliani'));
});

test('HTML/controle em nome de professor, disciplina ou turma é recusado (defesa contra XSS armazenado)', () => {
  const comProf = base(); comProf.turmas[0].aulas[0].professores = ['<img src=x onerror=alert(1)>'];
  assert.ok(montarPlano(comProf, {}, ctxVazio).bloqueios.some((b) => b.codigo === 'NOME_PROFESSOR_INVALIDO'));
  const comMat = base();
  assert.ok(montarPlano(comMat, { aulas: [{ pagina: 1, linha: 0, coluna: 0, materia: '<script>x</script>' }] }, ctxVazio).bloqueios.some((b) => b.codigo === 'MATERIA_INVALIDA'));
  assert.ok(montarPlano(base(), { professores: [{ nome_extraido: 'Ana Silva', nome_final: 'Ana <b>Silva</b>' }] }, ctxVazio).bloqueios.length > 0);
  assert.ok(montarPlano(base(), { turmas: [{ pagina: 1, nome: '<b>x</b>' }] }, ctxVazio).bloqueios.length > 0);
});

test('nomes reais com acento, apóstrofo, hífen e ponto continuam aceitos', () => {
  const d = base(); d.turmas[0].aulas[0].professores = ["Nídia Vieira", "Isabelle Nasc.", "Maria D'Ávila-Souza"];
  assert.equal(montarPlano(d, {}, ctxVazio).bloqueios.length, 0);
});

test('disciplina não identificada fica fora do plano sem impedir as disciplinas reconhecidas', () => {
  const d = base();
  d.turmas[0].aulas[0].identificacao_gabarito = { disciplina: { status: 'nao_identificado', texto_extraido: 'Matemática OCR' } };
  d.turmas[0].aulas[1].identificacao_gabarito = { disciplina: { status: 'identificado', nome_oficial: 'Matemática' } };
  const r = montarPlano(d, {}, ctxVazio);
  assert.equal(r.plano[0].aulas.length, 1);
  assert.equal(r.plano[0].aulas[0].hora_inicio, '19:50');
});

test('disciplina sem gabarito pode ser corrigida na prévia para ser incluída', () => {
  const d = base();
  d.turmas[0].aulas[0].identificacao_gabarito = { disciplina: { status: 'nao_identificado', texto_extraido: 'Matemática OCR' } };
  const r = montarPlano(d, { aulas: [{ pagina: 1, linha: 0, coluna: 0, materia: 'Matemática' }] }, ctxVazio);
  assert.equal(r.plano[0].aulas.length, 2);
  assert.equal(r.plano[0].aulas[0].materia, 'Matemática');
});
