'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cfg = require('../config/importacaoConfig');
const { executarLeitura } = require('../services/importacaoHorarios/pythonRunner');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'python-runner-runtime-'));
const scriptOriginal = cfg.SCRIPT_PYTHON;
const timeoutOriginal = cfg.TIMEOUT_PYTHON_MS;
test.after(() => {
  cfg.SCRIPT_PYTHON = scriptOriginal;
  cfg.TIMEOUT_PYTHON_MS = timeoutOriginal;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('recebe JSON e progresso do subprocesso com ID correlacionável', async () => {
  cfg.SCRIPT_PYTHON = path.join(dir, 'sucesso.js');
  cfg.TIMEOUT_PYTHON_MS = 5000;
  fs.writeFileSync(cfg.SCRIPT_PYTHON, [
    "process.stderr.write('@@PROGRESSO {\"etapa\":\"leitura_pdf\",\"pct\":50,\"mensagem\":\"Página 1\"}\\n');",
    "process.stdout.write(JSON.stringify({ok:true,dados:{arquivo:{sha256:'a'.repeat(64)},turmas:[]}}));",
  ].join('\n'));
  const progressos = [];
  const dados = await executarLeitura('fixture.pdf', (p) => progressos.push(p),
    { pythonBin: process.execPath, importacaoId: 41, tamanhoBytes: 123 });
  assert.equal(dados.arquivo.sha256, 'a'.repeat(64));
  assert.equal(progressos.length, 1);
  assert.equal(progressos[0].pct, 50);
});

test('timeout de subprocesso é explícito e não vira sucesso vazio', async () => {
  cfg.SCRIPT_PYTHON = path.join(dir, 'lento.js');
  cfg.TIMEOUT_PYTHON_MS = 100;
  fs.writeFileSync(cfg.SCRIPT_PYTHON, 'setTimeout(() => {}, 5000);');
  await assert.rejects(executarLeitura('fixture.pdf', () => {},
    { pythonBin: process.execPath, importacaoId: 42, tamanhoBytes: 123 }),
  (err) => err.codigo === 'TEMPO_ESGOTADO' && err.etapa === 'leitura_pdf');
});
