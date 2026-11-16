// A coordenadora é confirmada NO BANCO a cada chamada (o flag `admin` do token pode estar
// desatualizado se ela foi rebaixada depois de logar).
const pool = require('../config/db');
const repo = require('../services/importacaoHorarios/repositorio');

async function exigirCoordenadoraAtiva(req, res, next) {
  try {
    if (!(await repo.coordenadoraAtiva(pool, req.usuario.id))) {
      return res.status(403).json({ error: 'Acesso restrito à coordenadora' });
    }
    return next();
  } catch (err) {
    console.error('[importacao] verificação de coordenadora falhou:', err.code || err.message);
    return res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
}

module.exports = { exigirCoordenadoraAtiva };
