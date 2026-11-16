'use strict';

// Logs estruturados e sem conteúdo do PDF, tokens, SQL ou credenciais.
function instante() {
  const agora = new Date();
  let servidorLocal;
  try {
    servidorLocal = new Intl.DateTimeFormat('sv-SE', {
      dateStyle: 'short', timeStyle: 'long', timeZone: process.env.TZ || undefined,
    }).format(agora);
  } catch (_) {
    servidorLocal = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'long' }).format(agora);
  }
  return {
    utc: agora.toISOString(),
    servidor_local: servidorLocal,
    timezone_configurado: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'sistema',
  };
}

function registrar(evento, dados = {}, nivel = 'log') {
  const registro = { componente: 'importacao_pdf', evento, ...instante(), ...dados };
  console[nivel](`[importacao] ${JSON.stringify(registro)}`);
}

function resumoErro(err) {
  return {
    erro_codigo: err && (err.code || err.codigo || err.name) || 'ERRO_DESCONHECIDO',
    erro_mensagem: String(err && err.message || 'erro desconhecido').slice(0, 400),
  };
}

module.exports = { registrar, resumoErro, instante };
