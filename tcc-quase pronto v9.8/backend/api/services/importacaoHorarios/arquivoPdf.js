// Recebimento seguro do PDF.
//   * o conteúdo é conferido pelos bytes (assinatura %PDF-), não pela extensão;
//   * o nome interno é aleatório: nenhum caminho depende do que o usuário enviou;
//   * a pasta é privada e o arquivo é apagado assim que o Python termina (ver service).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cfg = require('../../config/importacaoConfig');
const { ErroImportacao, ETAPAS } = require('./erros');

function garantirPasta() {
  fs.mkdirSync(cfg.PASTA_TEMP, { recursive: true, mode: 0o700 });
}

function pareceUmPdf(buffer) {
  // a especificação permite lixo antes do cabeçalho nos primeiros 1024 bytes
  return buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
}

// Valida o buffer recebido e o grava com nome seguro. Devolve { caminho, sha256, tamanho }.
function validarEGuardar(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ErroImportacao('O arquivo enviado está vazio.', { etapa: ETAPAS.ENVIO, codigo: 'ARQUIVO_VAZIO' });
  }
  if (buffer.length > cfg.TAMANHO_MAX_BYTES) {
    throw new ErroImportacao(
      `O PDF é maior que o limite de ${Math.round(cfg.TAMANHO_MAX_BYTES / 1024 / 1024)} MB.`,
      { etapa: ETAPAS.ENVIO, codigo: 'ARQUIVO_GRANDE_DEMAIS', status: 413 });
  }
  if (!pareceUmPdf(buffer)) {
    throw new ErroImportacao('O conteúdo do arquivo não é um PDF válido.',
      { etapa: ETAPAS.ENVIO, codigo: 'NAO_E_PDF', status: 415 });
  }
  garantirPasta();
  const nomeInterno = `${crypto.randomUUID()}.pdf`;
  const caminho = path.join(cfg.PASTA_TEMP, nomeInterno);
  fs.writeFileSync(caminho, buffer, { mode: 0o600, flag: 'wx' });
  return {
    caminho,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    tamanho: buffer.length,
  };
}

// Só apaga arquivos que estão dentro da pasta temporária (defesa contra caminho forjado).
function apagar(caminho) {
  try {
    const raiz = path.resolve(cfg.PASTA_TEMP) + path.sep;
    const alvo = path.resolve(caminho);
    if (alvo.startsWith(raiz)) fs.rmSync(alvo, { force: true });
  } catch (err) {
    console.error('[importacao] falha ao apagar temporário:', err.code || err.message);
  }
}

// Remove sobras de execuções interrompidas.
function limparTemporariosAntigos() {
  try {
    garantirPasta();
    const limite = Date.now() - cfg.TEMP_MAX_IDADE_MS;
    for (const nome of fs.readdirSync(cfg.PASTA_TEMP)) {
      const p = path.join(cfg.PASTA_TEMP, nome);
      if (fs.statSync(p).mtimeMs < limite) apagar(p);
    }
  } catch (err) {
    console.error('[importacao] limpeza de temporários falhou:', err.code || err.message);
  }
}

module.exports = { validarEGuardar, apagar, limparTemporariosAntigos, pareceUmPdf };
