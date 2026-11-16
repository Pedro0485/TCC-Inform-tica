// Testes de INTEGRAÇÃO com banco real (MySQL/MariaDB de teste): gravação, idempotência,
// concorrência, rollback e substituição segura. Exigem DB_NAME contendo "test".
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');
const service = require('../services/importacaoHorarios/importacaoService');

let ok = false;
let coord;
test.before(async () => { ok = await H.bancoDisponivel(); });
test.beforeEach(async (t) => { if (!ok) return t.skip('banco de teste indisponível'); await H.limparTudo(); coord = await H.criarCoordenadora(); });
test.after(async () => { await H.pool.end(); });

const dados = () => H.leitura([
  H.turma(1, '1º Administração', 1, 'Administração', [
    H.aula('segunda', '19:00', '19:50', 'Matemática', ['Ana Silva', 'Camilo Mesquita']),
    H.aula('segunda', '19:50', '20:40', 'Matemática', ['Ana Silva', 'Camilo Mesquita'], { linha: 1 }),
    H.aula('terca', '19:00', '19:50', 'Física', ['Bruno Costa'], { coluna: 1 })]),
  H.turma(2, '2º Mecânica', 2, 'Mecânica', [H.aula('quarta', '21:00', '21:50', 'Soldagem', ['Bruno Costa'], { resto: { origem: { pagina: 2, linha: 0, coluna: 2 } } })]),
]);
const CRIAR = { criar_turmas_novas: true };

test('grava turmas, professores (sem login), aulas e vínculos', async () => {
  const id = await H.inserirImportacaoPronta(dados(), coord);
  const r = await service.confirmar(id, CRIAR);
  assert.equal(r.aulas_importadas, 4);
  assert.equal(r.turmas_criadas.length, 2);
  assert.equal(r.professores_criados, 3);
  const c = await H.contagens();
  // 1 coordenadora + 3 professores importados
  assert.deepEqual(c, { turmas: 2, professores: 4, aulas: 4, vinculos: 6 });
  const [[p]] = await H.pool.query("SELECT email, senha, admin FROM professores WHERE nome = 'Bruno Costa'");
  assert.equal(p.email, 'bruno.costa@professor.local', 'login automático nome.sobrenome');
  assert.ok(await require('bcrypt').compare('bruno.costa', p.senha), 'senha provisória = nome.sobrenome');
  assert.equal(p.admin, 0);
  const [[imp]] = await H.pool.query('SELECT status, total_aulas_importadas, confirmada_em FROM importacoes_horarios WHERE id = ?', [id]);
  assert.equal(imp.status, 'confirmada'); assert.equal(imp.total_aulas_importadas, 4); assert.ok(imp.confirmada_em);
  const [[a]] = await H.pool.query('SELECT importacao_id FROM aulas LIMIT 1');
  assert.equal(a.importacao_id, id, 'cada aula guarda de qual importação veio');
});

test('repetir a confirmação NÃO duplica nada (idempotência)', async () => {
  const id = await H.inserirImportacaoPronta(dados(), coord);
  await service.confirmar(id, CRIAR);
  const antes = await H.contagens();
  await assert.rejects(service.confirmar(id, CRIAR), (e) => e.codigo === 'JA_CONFIRMADA' && e.status === 409);
  assert.deepEqual(await H.contagens(), antes);
});

test('duas confirmações SIMULTÂNEAS: só uma grava', async () => {
  const id = await H.inserirImportacaoPronta(dados(), coord);
  const res = await Promise.allSettled([service.confirmar(id, CRIAR), service.confirmar(id, CRIAR)]);
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(res.filter((r) => r.status === 'rejected').length, 1);
  assert.deepEqual(await H.contagens(), { turmas: 2, professores: 4, aulas: 4, vinculos: 6 });
});

test('falha no meio da gravação desfaz TUDO e a importação continua pronta', async () => {
  const id = await H.inserirImportacaoPronta(dados(), coord);
  const antes = await H.contagens();
  const orig = H.pool.getConnection.bind(H.pool);
  H.pool.getConnection = async () => {       // simula queda ao gravar os vínculos aula↔professor
    const conn = await orig();
    const q = conn.query.bind(conn);
    conn.query = (sql, ...rest) => (String(sql).includes('INSERT INTO aulas_professores') ? Promise.reject(Object.assign(new Error('falha simulada'), { code: 'ER_SIMULADO' })) : q(sql, ...rest));
    return conn;
  };
  try {
    await assert.rejects(service.confirmar(id, CRIAR), (e) => e.etapa === 'gravacao_banco' && e.codigo === 'ERRO_BANCO');
  } finally { H.pool.getConnection = orig; }
  assert.deepEqual(await H.contagens(), antes, 'nada ficou pela metade (turmas, professores e aulas desfeitos)');
  const [[imp]] = await H.pool.query('SELECT status, etapa, erro_codigo FROM importacoes_horarios WHERE id = ?', [id]);
  assert.equal(imp.status, 'pronta'); assert.equal(imp.etapa, 'gravacao_banco'); assert.equal(imp.erro_codigo, 'ERRO_BANCO');
  const r = await service.confirmar(id, CRIAR);          // e dá para tentar de novo
  assert.equal(r.aulas_importadas, 4);
});

test('substitui só as turmas do PDF, guarda snapshot e preserva as demais', async () => {
  const [t1] = await H.pool.query("INSERT INTO turmas (nome, ano, codigo, turno) VALUES ('administração', 1, '111', 'noturno')");
  const [t3] = await H.pool.query("INSERT INTO turmas (nome, ano, codigo, turno) VALUES ('outra turma', 3, '333', 'noturno')");
  await H.pool.query("INSERT INTO aulas (turma_id, dia_semana, hora_inicio, hora_fim, materia) VALUES (?, 'sexta', '19:00', '19:50', 'Aula antiga'), (?, 'sexta', '19:00', '19:50', 'Intocada')", [t1.insertId, t3.insertId]);
  const id = await H.inserirImportacaoPronta(dados(), coord);
  const r = await service.confirmar(id, CRIAR);
  assert.equal(r.aulas_substituidas, 1);
  assert.equal(r.turmas_criadas.length, 1, 'só Mecânica é nova; Administração já existia');
  const [antiga] = await H.pool.query("SELECT 1 FROM aulas WHERE materia = 'Aula antiga'");
  assert.equal(antiga.length, 0);
  const [[intocada]] = await H.pool.query("SELECT COUNT(*) n FROM aulas WHERE materia = 'Intocada'");
  assert.equal(intocada.n, 1, 'turma fora do PDF não foi tocada');
  const [[imp]] = await H.pool.query('SELECT snapshot_anterior FROM importacoes_horarios WHERE id = ?', [id]);
  assert.equal(JSON.parse(imp.snapshot_anterior)[0].materia, 'Aula antiga', 'o que foi substituído ficou guardado');
});

test('reaproveita professor existente (sem acento/espaço/caixa) em vez de duplicar', async () => {
  await H.pool.query("INSERT INTO professores (nome, email, senha, admin) VALUES ('Camilo Me Squita', 'c@x.com', 'h', 0), ('ANA SILVA', 'a@x.com', 'h', 0)");
  const id = await H.inserirImportacaoPronta(dados(), coord);
  const r = await service.confirmar(id, CRIAR);
  assert.equal(r.professores_criados, 1, 'só Bruno Costa é novo');
  const [[n]] = await H.pool.query("SELECT COUNT(*) n FROM professores WHERE nome LIKE '%Mesquita%' OR nome LIKE '%Squita%'");
  assert.equal(n.n, 1);
});

test('importação com bloqueio NÃO grava nada', async () => {
  const d = dados(); d.turmas[0].aulas[0].requer_revisao = true;
  const id = await H.inserirImportacaoPronta(d, coord);
  const antes = await H.contagens();
  await assert.rejects(service.confirmar(id, CRIAR), (e) => e.codigo === 'BLOQUEIOS' && e.etapa === 'validacao_dados' && e.status === 422);
  assert.deepEqual(await H.contagens(), antes);
});

test('turma nova sem autorização para criar não grava nada', async () => {
  const id = await H.inserirImportacaoPronta(dados(), coord);
  await assert.rejects(service.confirmar(id, {}), (e) => e.codigo === 'BLOQUEIOS');
  assert.equal((await H.contagens()).aulas, 0);
});

test('importação cancelada ou inexistente não pode ser confirmada', async () => {
  const id = await H.inserirImportacaoPronta(dados(), coord);
  await service.cancelar(id);
  await assert.rejects(service.confirmar(id, CRIAR), (e) => e.codigo === 'STATUS_INVALIDO');
  await assert.rejects(service.confirmar(999999, CRIAR), (e) => e.status === 404);
});

test('o banco recusa duas aulas da mesma turma no mesmo dia e horário', async () => {
  const [t] = await H.pool.query("INSERT INTO turmas (nome, ano, codigo, turno) VALUES ('x', 1, '9', 'noturno')");
  await H.pool.query("INSERT INTO aulas (turma_id, dia_semana, hora_inicio, hora_fim, materia) VALUES (?, 'segunda', '19:00', '19:50', 'A')", [t.insertId]);
  await assert.rejects(H.pool.query("INSERT INTO aulas (turma_id, dia_semana, hora_inicio, hora_fim, materia) VALUES (?, 'segunda', '19:00', '19:50', 'B')", [t.insertId]), (e) => e.code === 'ER_DUP_ENTRY');
});

test('pré-visualização indica turma/professor existentes e sugere nomes parecidos', async () => {
  await H.pool.query("INSERT INTO turmas (nome, ano, codigo, turno) VALUES ('administração', 1, '111', 'noturno')");
  await H.pool.query("INSERT INTO professores (nome, email, senha, admin) VALUES ('Ana Silva', 'a@x.com', 'h', 0), ('Bruno Costa Junior', 'b@x.com', 'h', 0)");
  const d = dados(); d.professores = [{ nome: 'Ana Silva', aulas: 2, leituras_independentes: 3, variantes_corrigidas: [], alertas: [] }, { nome: 'Bruno Costa', aulas: 2, leituras_independentes: 3, variantes_corrigidas: [], alertas: [] }];
  const id = await H.inserirImportacaoPronta(d, coord);
  const p = await service.obterPreview(id);
  assert.equal(p.existentes.turmas[1].existente.nome, 'administração');
  assert.equal(p.existentes.turmas[2].existente, null);
  assert.ok(p.existentes.professores['Ana Silva'].existente);
  assert.equal(p.existentes.professores['Bruno Costa'].parecidos[0].nome, 'Bruno Costa Junior');
});
