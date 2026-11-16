// Falhas de ambiente do Python devem virar INSTRUÇÕES claras, nunca "resposta inválida" muda.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executarLeitura, diagnosticar, ambienteMinimo } = require('../services/importacaoHorarios/pythonRunner');

const PDF = path.join(__dirname, '..', '..', 'python', 'tests', 'fixtures', 'horario_tarde.pdf');
const naoWindows = process.platform === 'win32' ? { skip: 'usa scripts de shell' } : {};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function falso(nome, corpo) {   // "python" falso: um script que ignora os argumentos
  const p = path.join(tmp, nome); fs.writeFileSync(p, `#!/bin/sh\n${corpo}\n`, { mode: 0o755 }); return p;
}

test('o ambiente do Python leva HOME/APPDATA (pip --user) mas NUNCA os segredos do servidor', () => {
  process.env.DB_PASSWORD = 'segredo-db'; process.env.JWT_SECRET = 'segredo-jwt'; process.env.APPDATA = 'C:\\Users\\x\\AppData';
  const env = ambienteMinimo();
  assert.ok('PATH' in env && 'HOME' in env && 'APPDATA' in env, 'precisa achar o Python e as bibliotecas do usuário');
  assert.ok(!('DB_PASSWORD' in env) && !('JWT_SECRET' in env), 'não pode vazar credenciais');
  assert.equal(env.PYTHONUTF8, '1');
});

test('diagnóstico: Python inexistente', async () => {
  const d = await diagnosticar({ pythonBin: path.join(tmp, 'nao-existe') });
  assert.equal(d.problemas[0].codigo, 'PYTHON_INDISPONIVEL');
  assert.match(d.problemas[0].mensagem, /PYTHON_BIN/);
});

test('diagnóstico: biblioteca ausente diz qual e como instalar', naoWindows, async () => {
  const fake = path.join(tmp, 'fake'); fs.mkdirSync(fake);
  fs.writeFileSync(path.join(fake, 'cv2.py'), "raise ModuleNotFoundError(\"No module named 'cv2'\", name='cv2')\n");
  const bin = falso('py-sem-cv2', `PYTHONPATH="${fake}" exec python3 "$@"`);
  const d = await diagnosticar({ pythonBin: bin });
  assert.equal(d.problemas[0].codigo, 'DEPENDENCIA_AUSENTE');
  assert.match(d.problemas[0].mensagem, /"cv2".*pip install -r/);
});

test('diagnóstico: ambiente correto não tem problemas', naoWindows, async () => {
  const d = await diagnosticar();
  assert.deepEqual(d.problemas, [], JSON.stringify(d.problemas));
  assert.match(d.python, /^3\./);
});

test('Python que morre sem JSON por falta de módulo → DEPENDENCIA_AUSENTE com o nome', naoWindows, async () => {
  const bin = falso('py-morre', `echo "ModuleNotFoundError: No module named 'pytesseract'" >&2; exit 1`);
  await assert.rejects(executarLeitura(PDF, () => {}, { pythonBin: bin }),
    (e) => e.codigo === 'DEPENDENCIA_AUSENTE' && e.etapa === 'comunicacao_servicos' && /pytesseract/.test(e.message));
});

test('atalho "python3" da Microsoft Store (mensagem em stdout ou stderr) → PYTHON_INDISPONIVEL', naoWindows, async () => {
  const msg = 'Python was not found; run without arguments to install from the Microsoft Store';
  for (const [nome, corpo] of [['py-store-out', `echo "${msg}"; exit 9`], ['py-store-err', `echo "${msg}" >&2; exit 9`]]) {
    await assert.rejects(executarLeitura(PDF, () => {}, { pythonBin: falso(nome, corpo) }), (e) => e.codigo === 'PYTHON_INDISPONIVEL', nome);
  }
});

test('falha desconhecida sem resposta orienta a olhar o terminal do servidor', naoWindows, async () => {
  const bin = falso('py-mudo', 'exit 3');
  await assert.rejects(executarLeitura(PDF, () => {}, { pythonBin: bin }),
    (e) => e.codigo === 'RESPOSTA_INVALIDA' && /terminal do servidor/.test(e.message));
});

test('CLI com biblioteca ausente devolve JSON explicativo (não traceback mudo)', naoWindows, async () => {
  const fake = path.join(tmp, 'fake2'); fs.mkdirSync(fake);
  fs.writeFileSync(path.join(fake, 'cv2.py'), "raise ModuleNotFoundError(\"No module named 'cv2'\", name='cv2')\n");
  const bin = falso('py-cli-sem-cv2', `PYTHONPATH="${fake}" exec python3 "$@"`);
  await assert.rejects(executarLeitura(PDF, () => {}, { pythonBin: bin }),
    (e) => e.codigo === 'DEPENDENCIA_AUSENTE' && /cv2/.test(e.message) && /pip install/.test(e.message));
});
