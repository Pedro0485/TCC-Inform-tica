// Login automático dos professores criados pela importação de PDF.
//   usuário = nome.sobrenome   (ex.: "MARIA IVONE CHAGAS" -> maria.chagas)
//   senha inicial = o mesmo nome.sobrenome (o professor é avisado para trocar no 1º acesso)
// No banco o "email" fica como nome.sobrenome@DOMINIO; no login o professor pode digitar só
// "nome.sobrenome" (o domínio é completado automaticamente).

const DOMINIO = (process.env.EMAIL_DOMINIO_PROFESSOR || 'professor.cps.sp.gov.br').replace(/^@/, '');
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function semAcento(txt) {
  return String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// "Maria Ivone Chagas" -> "maria.chagas"; "Ana" -> "ana"
function gerarLogin(nome) {
  const partes = semAcento(nome).toLowerCase().replace(/[^a-z\s]/g, ' ')
    .split(/\s+/).filter((p) => p && !PARTICULAS.has(p));
  if (partes.length === 0) return 'professor';
  if (partes.length === 1) return partes[0];
  return `${partes[0]}.${partes[partes.length - 1]}`;
}

// garante login único: maria.chagas, maria.chagas2, maria.chagas3...
// `emailsUsados` é um Set de emails já existentes (é atualizado aqui).
function loginUnico(nome, emailsUsados) {
  const base = gerarLogin(nome);
  let login = base;
  for (let i = 2; emailsUsados.has(`${login}@${DOMINIO}`); i++) login = `${base}${i}`;
  emailsUsados.add(`${login}@${DOMINIO}`);
  return login;
}

const emailDoLogin = (login) => `${login}@${DOMINIO}`;

// no login: "maria.chagas" vira "maria.chagas@dominio"; email completo passa direto
function normalizarEntradaLogin(txt) {
  const v = String(txt || '').trim().toLowerCase();
  return v && !v.includes('@') ? `${v}@${DOMINIO}` : v;
}

// true só para professor criado pela importação que ainda usa a senha provisória:
// email nome.sobrenome@DOMINIO e a senha digitada é exatamente o nome.sobrenome
function usaSenhaProvisoria(email, senhaDigitada) {
  const e = String(email || '').toLowerCase();
  const sufixo = `@${DOMINIO}`;
  return e.endsWith(sufixo) && String(senhaDigitada) === e.slice(0, -sufixo.length);
}

module.exports = { usaSenhaProvisoria, DOMINIO, gerarLogin, loginUnico, emailDoLogin, normalizarEntradaLogin };
