// Teste ponta a ponta: servidor real + Python/OCR reais + banco de teste.
// Demora ~1 min (o OCR do PDF de exemplo). Exige DB_NAME com "test", Tesseract e Python.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const H = require('./helpers');
const { gerarTokenProfessor } = require('../utils/jwt');

const PORTA = 3998;
const BASE = `http://127.0.0.1:${PORTA}`;
const PDF = path.join(__dirname, '..', '..', 'python', 'tests', 'fixtures', 'horario_tarde.pdf');
let servidor; let ok = false; let tokenAdmin; let coordId; let tempDir;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
function formPdf(buffer, nome = 'horarios.pdf') {
  const f = new FormData(); f.append('arquivo', new Blob([buffer]), nome); return f;
}
const api = (rota, { token = tokenAdmin, metodo = 'GET', corpo, form } = {}) => fetch(BASE + rota, {
  method: metodo,
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
  body: form || (corpo ? JSON.stringify(corpo) : undefined),
});

test.before(async () => {
  ok = await H.bancoDisponivel();
  if (!ok) return;
  await H.limparTudo();
  coordId = await H.criarCoordenadora();
  tokenAdmin = gerarTokenProfessor({ id: coordId, nome: 'Coord', email: 'coord@teste.local', admin: 1 });
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'));
  servidor = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PORT: String(PORTA), IMPORTACAO_MAX_MB: '1', IMPORTACAO_TEMP_DIR: tempDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('servidor não subiu')), 15000);
    servidor.stdout.on('data', (d) => { if (String(d).includes('Servidor rodando')) { clearTimeout(t); res(); } });
  });
});
test.after(async () => { if (servidor) servidor.kill(); await H.pool.end(); if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true }); });

test('exige autenticação e coordenadora (incluindo token de admin desatualizado)', async (t) => {
  if (!ok) return t.skip('banco indisponível');
  assert.equal((await api('/importacoes/horarios', { token: null })).status, 401);
  const [r] = await H.pool.query("INSERT INTO professores (nome, email, senha, admin) VALUES ('Comum', 'c@x.com', 'h', 0)");
  const comum = gerarTokenProfessor({ id: r.insertId, nome: 'Comum', email: 'c@x.com', admin: 0 });
  assert.equal((await api('/importacoes/horarios', { token: comum })).status, 403);
  // token diz admin, mas no banco ela JÁ NÃO é mais coordenadora
  const falsoAdmin = gerarTokenProfessor({ id: r.insertId, nome: 'Comum', email: 'c@x.com', admin: 1 });
  assert.equal((await api('/importacoes/horarios', { token: falsoAdmin })).status, 403);
  assert.equal((await api('/importacoes/horarios', { token: tokenAdmin })).status, 200);
  // verificação do ambiente (Python/bibliotecas/Tesseract): só coordenadora
  assert.equal((await api('/importacoes/ambiente', { token: null })).status, 401);
  assert.equal((await api('/importacoes/ambiente', { token: comum })).status, 403);
  const amb = await (await api('/importacoes/ambiente')).json();
  assert.ok(Array.isArray(amb.problemas), 'devolve a lista de problemas (vazia se estiver tudo pronto)');
});

test('rejeita arquivos inválidos antes de processar', async (t) => {
  if (!ok) return t.skip('banco indisponível');
  const falso = await api('/importacoes/horarios', { metodo: 'POST', form: formPdf(Buffer.from('isto é texto, não um PDF'), 'falso.pdf') });
  assert.equal(falso.status, 415); assert.equal((await falso.json()).codigo, 'NAO_E_PDF');
  const ext = await api('/importacoes/horarios', { metodo: 'POST', form: formPdf(fs.readFileSync(PDF), 'horarios.exe') });
  assert.equal(ext.status, 415);
  const vazio = await api('/importacoes/horarios', { metodo: 'POST', form: formPdf(Buffer.alloc(0), 'v.pdf') });
  assert.equal(vazio.status, 400);
  const grande = await api('/importacoes/horarios', { metodo: 'POST', form: formPdf(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2 * 1024 * 1024)]), 'g.pdf') });
  assert.equal(grande.status, 413);
  const semArq = await api('/importacoes/horarios', { metodo: 'POST', form: new FormData() });
  assert.equal(semArq.status, 400);
  assert.equal((await H.contagens()).aulas, 0);
  assert.equal(fs.readdirSync(tempDir).length, 0, 'nada ficou na pasta temporária');
});

test('PDF corrompido (cabeçalho válido, conteúdo quebrado) falha na etapa de leitura, sem gravar nada', async (t) => {
  if (!ok) return t.skip('banco indisponível');
  const r = await api('/importacoes/horarios', { metodo: 'POST', form: formPdf(Buffer.from('%PDF-1.4\n1 0 obj << /Broken >>\nlixo\n'), 'quebrado.pdf') });
  assert.equal(r.status, 202);
  const { id } = await r.json();
  let s; for (let i = 0; i < 40; i++) { s = await (await api(`/importacoes/horarios/${id}`)).json(); if (s.status !== 'processando') break; await esperar(500); }
  assert.equal(s.status, 'falhou'); assert.equal(s.etapa, 'leitura_pdf'); assert.ok(s.erro_mensagem);
  assert.equal((await api(`/importacoes/horarios/${id}/preview`)).status, 409);
  assert.equal(fs.readdirSync(tempDir).length, 0, 'PDF temporário foi apagado mesmo na falha');
});

test('fluxo completo: envia o PDF real, confere a pré-visualização e só grava depois de revisar', { timeout: 240000 }, async (t) => {
  if (!ok) return t.skip('banco indisponível');
  const antes = await H.contagens();
  const envio = await api('/importacoes/horarios', { metodo: 'POST', form: formPdf(fs.readFileSync(PDF), 'Horário TARDE.pdf') });
  assert.equal(envio.status, 202);
  const { id } = await envio.json();

  // andamento por etapas
  let s; const etapas = new Set();
  for (let i = 0; i < 280; i++) { s = await (await api(`/importacoes/horarios/${id}`)).json(); etapas.add(s.etapa); if (s.status !== 'processando') break; await esperar(500); }
  assert.equal(s.status, 'pronta', `status final: ${s.status} ${s.erro_mensagem || ''}`);
  assert.ok(etapas.has('leitura') || etapas.has('leitura_pdf'), 'mostrou a etapa de leitura');
  assert.equal(fs.readdirSync(tempDir).length, 0, 'PDF temporário apagado após o processamento');
  assert.deepEqual(await H.contagens(), antes, 'ler o PDF NÃO grava nada no banco');

  const prev = await (await api(`/importacoes/horarios/${id}/preview`)).json();
  assert.equal(prev.dados.turmas.length, 2);
  assert.equal(prev.dados.turmas.reduce((n, x) => n + x.aulas.length, 0), 60);
  const turmaNomes = prev.dados.turmas.map((x) => x.nome);
  assert.deepEqual(turmaNomes, ['MKT-T', 'Des. Sistemas - T']);
  assert.ok(prev.dados.turmas.every((x) => x.turno_sugerido === 'vespertino'));

  // 1) tentar gravar sem revisar o que está marcado é BLOQUEADO
  const cedo = await api(`/importacoes/horarios/${id}/confirmar`, { metodo: 'POST', corpo: { criar_turmas_novas: true } });
  assert.equal(cedo.status, 422);
  const corpoCedo = await cedo.json();
  assert.equal(corpoCedo.codigo, 'BLOQUEIOS');
  assert.deepEqual(await H.contagens(), antes, 'bloqueio não grava nada');

  // 2) coordenadora confere tudo o que foi marcado e confirma
  const aulasRev = prev.dados.turmas.flatMap((x) => x.aulas.filter((a) => a.requer_revisao).map((a) => ({ pagina: x.pagina, ...a.origem, conferido: true })));
  const turmasConf = prev.dados.turmas.map((x) => ({ pagina: x.pagina, horarios_conferidos: true }));
  const ok1 = await api(`/importacoes/horarios/${id}/confirmar`, { metodo: 'POST', corpo: { criar_turmas_novas: true, aulas: aulasRev, turmas: turmasConf } });
  const corpoOk = await ok1.json();
  assert.equal(ok1.status, 200, JSON.stringify(corpoOk).slice(0, 400));
  assert.equal(corpoOk.resultado.aulas_importadas, 60);
  assert.equal(corpoOk.resultado.turmas_criadas.length, 2);

  const c = await H.contagens();
  assert.equal(c.aulas, 60); assert.equal(c.turmas, 2);
  const [[sem]] = await H.pool.query("SELECT COUNT(*) n FROM aulas a LEFT JOIN aulas_professores ap ON ap.aula_id = a.id WHERE ap.aula_id IS NULL");
  assert.equal(sem.n, 0, 'toda aula tem professor vinculado');

  // 3) repetir a requisição não duplica
  const dup = await api(`/importacoes/horarios/${id}/confirmar`, { metodo: 'POST', corpo: { criar_turmas_novas: true, aulas: aulasRev, turmas: turmasConf } });
  assert.equal(dup.status, 409);
  assert.deepEqual(await H.contagens(), c);

  // 4) histórico registra a importação concluída
  const hist = await (await api('/importacoes/horarios')).json();
  assert.equal(hist.find((h) => h.id === id).status, 'confirmada');
});

test('consulta de horários após a importação, com autorização por perfil', { timeout: 60000 }, async (t) => {
  if (!ok) return t.skip('banco indisponível');
  const { gerarTokenTurma } = require('../utils/jwt');
  const [turmas] = await H.pool.query('SELECT id, nome, ano, turno FROM turmas ORDER BY id');
  assert.equal(turmas.length, 2, 'depende do teste anterior (importação concluída)');
  const [t1, t2] = turmas;

  // coordenadora vê qualquer turma, com professores e horários HH:MM
  const r1 = await (await api(`/horarios/turma/${t1.id}`)).json();
  assert.equal(r1.aulas.length, 30);
  assert.match(r1.aulas[0].hora_inicio, /^\d\d:\d\d$/);
  assert.ok(r1.aulas.every((a) => a.professores.length >= 1));
  assert.deepEqual(r1.aulas.slice(0, 1).map((a) => a.dia_semana), ['segunda']);

  // aluno: só a própria turma
  const tokAluno = gerarTokenTurma(t1);
  assert.equal((await api(`/horarios/turma/${t1.id}`, { token: tokAluno })).status, 200);
  assert.equal((await api('/horarios/turma/me', { token: tokAluno })).status, 200);
  assert.equal((await api(`/horarios/turma/${t2.id}`, { token: tokAluno })).status, 403);
  assert.equal((await api(`/horarios/professor/me`, { token: tokAluno })).status, 403);

  // professor (não coordenador): só os próprios
  const [[prof]] = await H.pool.query('SELECT p.id, p.nome FROM professores p JOIN aulas_professores ap ON ap.professor_id = p.id LIMIT 1');
  const [[outro]] = await H.pool.query('SELECT p.id FROM professores p JOIN aulas_professores ap ON ap.professor_id = p.id WHERE p.id <> ? LIMIT 1', [prof.id]);
  const tokProf = gerarTokenProfessor({ id: prof.id, nome: prof.nome, email: null, admin: 0 });
  const meus = await (await api('/horarios/professor/me', { token: tokProf })).json();
  assert.ok(meus.aulas.length > 0 && meus.aulas.every((a) => a.turma_nome));
  assert.equal((await api(`/horarios/professor/${outro.id}`, { token: tokProf })).status, 403);
  assert.equal((await api(`/horarios/professor/${outro.id}`)).status, 200, 'coordenadora vê qualquer professor');

  // sem token, id inválido, inexistente
  assert.equal((await api(`/horarios/turma/${t1.id}`, { token: null })).status, 401);
  assert.equal((await api('/horarios/turma/abc')).status, 400);
  assert.equal((await api('/horarios/turma/999999')).status, 404);
});
