// Migração 002 — login automático para professores já importados do PDF
// Só mexe em professores SEM email ou SEM senha (criados pela importação):
// ganham login nome.sobrenome e senha provisória igual. Quem já tem login não é alterado
// (coordenadora e usuários criados em "Usuários" ficam como estão). Idempotente.
const bcrypt = require('bcrypt');
const { loginUnico, emailDoLogin } = require('../../api/utils/loginProfessor');

module.exports = {
  id: '002_login_automatico_professores',
  descricao: 'Professores importados do PDF (sem acesso) ganham login nome.sobrenome',

  async up(conn) {
    const [usados] = await conn.query('SELECT email FROM professores WHERE email IS NOT NULL');
    const emails = new Set(usados.map((r) => r.email));
    const [semLogin] = await conn.query('SELECT id, nome FROM professores WHERE (email IS NULL OR senha IS NULL) AND admin = 0');
    for (const p of semLogin) {
      const login = loginUnico(p.nome, emails);
      const hash = await bcrypt.hash(login, 10);
      await conn.query('UPDATE professores SET email = ?, senha = ? WHERE id = ?', [emailDoLogin(login), hash, p.id]);
    }
  },
};
