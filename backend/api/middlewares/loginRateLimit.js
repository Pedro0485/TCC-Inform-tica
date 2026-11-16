'use strict';

const crypto = require('crypto');
const { normalizarEntradaLogin } = require('../utils/loginProfessor');

const MAX_TENTATIVAS = Math.max(3, Number(process.env.LOGIN_MAX_TENTATIVAS) || 10);
const JANELA_MS = Math.max(60, Number(process.env.LOGIN_JANELA_SEGUNDOS) || 900) * 1000;
const tentativas = new Map();

const ALIASES_TURMA = {
  info: 'info', informatica: 'info',
  edf: 'edf', edificacoes: 'edf',
  meca: 'meca', mecatronica: 'meca',
  adm: 'adm', administracao: 'adm',
  dse: 'dse', desenvolvimento_de_sistemas: 'dse',
  mkt: 'mkt', marketing: 'mkt',
};

function identidade(tipo, req) {
  const body = req.body || {};
  let valor;
  if (tipo === 'professor') {
    valor = normalizarEntradaLogin(body.email || '');
  } else {
    const curso = String(body.turma || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    valor = `${ALIASES_TURMA[curso] || curso}:${String(body.ano || '').trim()}`;
  }
  return `${tipo}:${crypto.createHash('sha256').update(valor || 'vazio').digest('hex')}`;
}

function limparExpiradas(agora) {
  for (const [chave, item] of tentativas) {
    if (item.expiraEm <= agora) tentativas.delete(chave);
  }
  while (tentativas.size > 10000) tentativas.delete(tentativas.keys().next().value);
}

function limitarTentativasLogin(tipo) {
  return (req, res, next) => {
    const agora = Date.now();
    limparExpiradas(agora);
    const chave = identidade(tipo, req);
    const registro = tentativas.get(chave);

    if (registro && registro.quantidade >= MAX_TENTATIVAS) {
      const segundos = Math.max(1, Math.ceil((registro.expiraEm - agora) / 1000));
      res.setHeader('Retry-After', String(segundos));
      return res.status(429).json({ message: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
    }

    tentativas.set(chave, {
      quantidade: (registro ? registro.quantidade : 0) + 1,
      expiraEm: registro ? registro.expiraEm : agora + JANELA_MS,
    });
    res.once('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) tentativas.delete(chave);
    });
    return next();
  };
}

module.exports = { limitarTentativasLogin };
