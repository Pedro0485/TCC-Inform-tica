const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!SECRET) {
  console.warn('[AVISO] JWT_SECRET não definido no .env — defina antes de usar em produção.');
}
// Função para gerar token JWT para professor
function gerarTokenProfessor(professor) {
  return jwt.sign(
    {
      id: professor.id,
      nome: professor.nome,
      email: professor.email,
      admin: !!professor.admin,
      tipo: 'professor'
    },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

// Função para gerar token JWT para turma
function gerarTokenTurma(turma) {
  return jwt.sign(
    {
      id: turma.id,
      nome: turma.nome,
      ano: turma.ano,
      turno: turma.turno,
      tipo: 'turma'
    },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

module.exports = { gerarTokenProfessor, gerarTokenTurma };
