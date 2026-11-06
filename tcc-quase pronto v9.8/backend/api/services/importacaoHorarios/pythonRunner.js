// Executa o leitor de PDFs em Python como subprocesso.
//
// Segurança:
//   * execFile/spawn com ARGUMENTOS em array e shell:false: nada é interpretado por shell;
//   * o único argumento variável é o caminho que NÓS geramos (UUID), nunca texto do usuário;
//   * o filho recebe um ambiente mínimo: não herda DB_PASSWORD, JWT_SECRET etc.;
//   * tempo máximo e tamanho máximo de saída.
const { spawn } = require('child_process');
const cfg = require('../../config/importacaoConfig');
const { ErroImportacao, ETAPAS } = require('./erros');

function ambienteMinimo() {
  const base = {};
  // Só variáveis necessárias para o Python achar a instalação e as bibliotecas (inclusive as
  // instaladas com `pip install --user`, que dependem de HOME/APPDATA). Nenhum segredo do .env.
  const necessarias = ['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL',
    'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
    'PROGRAMDATA', 'VIRTUAL_ENV', 'PYTHONPATH', 'TESSDATA_PREFIX'];
  for (const k of necessarias) {
    if (process.env[k] !== undefined) base[k] = process.env[k];
  }
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('HORARIOS_')) base[k] = process.env[k];
  }
  return { ...base, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' };
}

function executarLeitura(caminhoPdf, onProgresso = () => {}, { pythonBin } = {}) {
  return new Promise((resolve, reject) => {
    let filho;
    try {
      filho = spawn(pythonBin || cfg.PYTHON_BIN, [cfg.SCRIPT_PYTHON, caminhoPdf], {
        shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: ambienteMinimo(),
      });
    } catch (err) {
      return reject(falhaComunicacao('PYTHON_INDISPONIVEL', 'Não foi possível iniciar o leitor de PDFs.'));
    }

    const saida = [];
    let tamanhoSaida = 0;
    let restoErr = '';
    let caudaErr = '';
    let encerrado = false;
    const finalizar = (fn, valor) => { if (!encerrado) { encerrado = true; clearTimeout(timer); fn(valor); } };

    const timer = setTimeout(() => {
      filho.kill('SIGKILL');
      finalizar(reject, new ErroImportacao('A leitura do PDF demorou mais que o permitido e foi cancelada.',
        { etapa: ETAPAS.LEITURA, codigo: 'TEMPO_ESGOTADO', status: 504 }));
    }, cfg.TIMEOUT_PYTHON_MS);

    filho.stdout.on('data', (chunk) => {
      tamanhoSaida += chunk.length;
      if (tamanhoSaida > cfg.MAX_SAIDA_PYTHON_BYTES) {
        filho.kill('SIGKILL');
        return finalizar(reject, falhaComunicacao('RESPOSTA_GRANDE_DEMAIS', 'A resposta do leitor de PDFs excedeu o limite.'));
      }
      saida.push(chunk);
    });

    // stderr: linhas "@@PROGRESSO {json}" (andamento) + logs técnicos
    filho.stderr.on('data', (chunk) => {
      restoErr += chunk.toString('utf8');
      caudaErr = (caudaErr + chunk.toString('utf8')).slice(-4000);
      let i;
      while ((i = restoErr.indexOf('\n')) >= 0) {
        const linha = restoErr.slice(0, i).trim();
        restoErr = restoErr.slice(i + 1);
        if (linha.startsWith('@@PROGRESSO ')) {
          try { onProgresso(JSON.parse(linha.slice(12))); } catch (_) { /* linha ruim: ignora */ }
        } else if (linha) {
          console.error('[python]', linha.slice(0, 300));
        }
      }
    });

    filho.on('error', (err) => {
      finalizar(reject, err.code === 'ENOENT'
        ? falhaComunicacao('PYTHON_INDISPONIVEL', `Python não encontrado ("${pythonBin || cfg.PYTHON_BIN}"). Defina PYTHON_BIN no .env (no Windows: PYTHON_BIN=python).`)
        : falhaComunicacao('PYTHON_FALHOU', 'Falha ao executar o leitor de PDFs.'));
    });

    filho.on('close', (codigo) => {
      let resposta;
      try {
        resposta = JSON.parse(Buffer.concat(saida).toString('utf8'));
      } catch (_) {
        // o aviso do atalho da Microsoft Store pode sair em stdout ou stderr: olha os dois
        return finalizar(reject, explicarFalhaSemResposta(codigo, `${Buffer.concat(saida).toString('utf8').slice(0, 600)}\n${caudaErr}`));
      }
      if (resposta && resposta.ok === true && resposta.dados) return finalizar(resolve, resposta.dados);
      const e = (resposta && resposta.erro) || {};
      return finalizar(reject, new ErroImportacao(
        typeof e.mensagem === 'string' ? e.mensagem.slice(0, 300) : 'Erro ao ler o PDF.',
        { etapa: e.etapa === ETAPAS.VALIDACAO ? ETAPAS.VALIDACAO : ETAPAS.LEITURA,
          codigo: typeof e.codigo === 'string' ? e.codigo.slice(0, 60) : `PYTHON_SAIDA_${codigo}`, status: 422 }));
    });
  });
}

// O Python morreu sem escrever o JSON de resposta. Procura no stderr (só traceback técnico,
// nunca conteúdo do PDF) o motivo mais comum e devolve uma instrução em vez de "resposta inválida".
function explicarFalhaSemResposta(codigoSaida, stderr) {
  const modulo = /No module named '([\w.]+)'/.exec(stderr);
  if (modulo) {
    return falhaComunicacao('DEPENDENCIA_AUSENTE',
      `Falta instalar a biblioteca Python "${modulo[1].split('.')[0]}". Rode: python -m pip install -r backend/python/requirements.txt ` +
      '(use o mesmo Python definido em PYTHON_BIN).');
  }
  if (codigoSaida === 9009 || /Python was not found|Microsoft Store|não foi encontrado/i.test(stderr)) {
    return falhaComunicacao('PYTHON_INDISPONIVEL',
      `O comando "${cfg.PYTHON_BIN}" não é um Python instalado. Instale o Python 3.10+ e defina PYTHON_BIN no .env (no Windows: PYTHON_BIN=python).`);
  }
  return falhaComunicacao('RESPOSTA_INVALIDA',
    'O leitor de PDFs encerrou sem devolver resultado. Veja o terminal do servidor (linhas "[python]") para o motivo técnico.');
}

// Verifica se este computador está pronto para ler PDFs (Python, bibliotecas, Tesseract em português).
// Devolve { python, problemas: [{ codigo, mensagem }] }. Nunca lança.
const SCRIPT_DIAGNOSTICO = [
  'import json, sys',
  'sys.path.insert(0, sys.argv[1])',
  'out = {"python": sys.version.split()[0], "problemas": []}',
  'for m in ("pdfplumber", "cv2", "numpy", "pytesseract", "PIL"):',
  '    try: __import__(m)',
  '    except Exception: out["problemas"].append({"codigo": "DEPENDENCIA_AUSENTE", "modulo": m})',
  'if not out["problemas"]:',
  '    try:',
  '        from horarios_pdf import ocr; ocr.verificar_tesseract()',
  '    except Exception as e:',
  '        out["problemas"].append({"codigo": getattr(e, "codigo", "OCR_INDISPONIVEL"), "mensagem": str(e)})',
  'print(json.dumps(out))',
].join('\n');

function diagnosticar({ pythonBin } = {}) {
  const bin = pythonBin || cfg.PYTHON_BIN;
  const pastaPython = require('path').dirname(cfg.SCRIPT_PYTHON);
  return new Promise((resolve) => {
    const pronto = (problemas, python = null) => resolve({ python, problemas });
    let filho;
    try {
      filho = spawn(bin, ['-c', SCRIPT_DIAGNOSTICO, pastaPython], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: ambienteMinimo() });
    } catch (_) {
      return pronto([{ codigo: 'PYTHON_INDISPONIVEL', mensagem: `Não foi possível iniciar "${bin}". Defina PYTHON_BIN no .env.` }]);
    }
    let saida = ''; let erro = '';
    const t = setTimeout(() => { filho.kill('SIGKILL'); pronto([{ codigo: 'DIAGNOSTICO_DEMOROU', mensagem: 'A verificação do Python demorou demais.' }]); }, 20000);
    filho.stdout.on('data', (c) => { saida += c; });
    filho.stderr.on('data', (c) => { erro += c; });
    filho.on('error', (e) => { clearTimeout(t); pronto([{ codigo: 'PYTHON_INDISPONIVEL',
      mensagem: e.code === 'ENOENT' ? `Python não encontrado ("${bin}"). Instale o Python 3.10+ e defina PYTHON_BIN no .env (no Windows: PYTHON_BIN=python).` : 'Falha ao iniciar o Python.' }]); });
    filho.on('close', (codigo) => {
      clearTimeout(t);
      try {
        const r = JSON.parse(saida.trim().split('\n').pop());
        const problemas = r.problemas.map((p) => (p.codigo === 'DEPENDENCIA_AUSENTE'
          ? { codigo: p.codigo, mensagem: `Falta a biblioteca Python "${p.modulo}". Rode: python -m pip install -r backend/python/requirements.txt` }
          : { codigo: p.codigo, mensagem: p.mensagem }));
        return pronto(problemas, r.python);
      } catch (_) {
        return pronto([explicarFalhaSemResposta(codigo, erro)].map((e) => ({ codigo: e.codigo, mensagem: e.message })));
      }
    });
  });
}

function falhaComunicacao(codigo, mensagem) {
  return new ErroImportacao(mensagem, { etapa: ETAPAS.COMUNICACAO, codigo, status: 502 });
}

module.exports = { executarLeitura, diagnosticar, ambienteMinimo };
