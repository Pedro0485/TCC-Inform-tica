const jwt = require('jsonwebtoken');
const importacaoLog = require('../services/importacaoHorarios/log');
const pool = require('../config/db');

const SECRET = process.env.JWT_SECRET;

// Extrai e valida o token JWT enviado no header Authorization: Bearer <token>
function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não informado' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, SECRET);
    req.usuario = payload; // { id, nome, email, admin, tipo } ou { id, nome, ano, turno, tipo }
    return next();
  } catch (err) {
    if (String(req.originalUrl || req.url || '').startsWith('/importacoes/')) {
      const decodificado = jwt.decode(token) || {};
      importacaoLog.registrar('autenticacao_recusada', {
        rota: String(req.originalUrl || req.url).split('?')[0], metodo: req.method,
        motivo: err.name || 'JsonWebTokenError', token_iat_epoch: decodificado.iat || null,
        token_exp_epoch: decodificado.exp || null, servidor_epoch: Math.floor(Date.now() / 1000),
        diferenca_expiracao_segundos: Number.isFinite(decodificado.exp) ? decodificado.exp - Math.floor(Date.now() / 1000) : null,
      }, 'warn');
    }
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// Garante que o token pertence a um professor (não a uma turma)
function apenasProfessor(req, res, next) {
  if (!req.usuario || req.usuario.tipo !== 'professor') {
    return res.status(403).json({ error: 'Acesso restrito a professores' });
  }
  return next();
}

// Garante que o professor autenticado é a coordenadora (admin = 1)
async function apenasCoordenadora(req, res, next) {
  if (!req.usuario || req.usuario.tipo !== 'professor') {
    return res.status(403).json({ error: 'Acesso restrito à coordenadora' });
  }
  try {
    const [rows] = await pool.query('SELECT admin FROM professores WHERE id = ? LIMIT 1', [req.usuario.id]);
    if (!rows[0] || !rows[0].admin) {
      return res.status(403).json({ error: 'Acesso restrito à coordenadora' });
    }
    return next();
  } catch (err) {
    console.error('[auth] não foi possível confirmar o perfil de coordenadora:', err.code || err.name);
    return res.status(503).json({ error: 'Não foi possível validar suas permissões agora.' });
  }
}

// Usado só na rota interna que o script Python chama (não é um usuário logado,
// então não tem token JWT — usa uma chave fixa compartilhada via .env)
function verificarChaveInterna(req, res, next) {
  const chave = req.headers['x-internal-key'];

  if (!process.env.PYTHON_INTERNAL_KEY) {
    console.error('PYTHON_INTERNAL_KEY não configurada no .env');
    return res.status(500).json({ error: 'Rota interna não configurada' });
  }

  if (!chave || chave !== process.env.PYTHON_INTERNAL_KEY) {
    return res.status(401).json({ error: 'Chave interna inválida' });
  }

  return next();
}

module.exports = { verificarToken, apenasProfessor, apenasCoordenadora, verificarChaveInterna };
