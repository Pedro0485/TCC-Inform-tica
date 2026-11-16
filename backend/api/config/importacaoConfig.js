// Configuração da importação de horários. Tudo que muda entre ambientes vem do .env.
const path = require('path');

const MB = 1024 * 1024;

module.exports = {
  // limite do PDF enviado
  TAMANHO_MAX_BYTES: Number(process.env.IMPORTACAO_MAX_MB || 20) * MB,
  // pasta PRIVADA (fora de qualquer rota estática) onde o PDF fica só durante o processamento
  PASTA_TEMP: process.env.IMPORTACAO_TEMP_DIR || path.join(__dirname, '..', '..', 'storage', 'importacoes-tmp'),
  // arquivos temporários mais velhos que isso são apagados na inicialização
  TEMP_MAX_IDADE_MS: 60 * 60 * 1000,
  // no Windows o executável é `python` (o `python3` de lá costuma ser só um atalho da Microsoft Store)
  PYTHON_BIN: process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'),
  SCRIPT_PYTHON: path.join(__dirname, '..', '..', 'python', 'read_horarios_pdf.py'),
  TIMEOUT_PYTHON_MS: Number(process.env.IMPORTACAO_TIMEOUT_S || 1800) * 1000,
  MAX_SAIDA_PYTHON_BYTES: 64 * MB,
  // o OCR é pesado: só processa N PDFs ao mesmo tempo
  MAX_PROCESSAMENTOS_SIMULTANEOS: Math.max(1, Math.floor(Number(process.env.IMPORTACAO_MAX_SIMULTANEAS) || 1)),
};
