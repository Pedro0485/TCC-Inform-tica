// Nomes curtos das turmas criadas pela importação de PDF.
// O PDF traz títulos como "1º Administração - Bariri" ou "2º Mtec - PI - EDIFICAÇÕES".
// Para criar as turmas com um nome padronizado (ex.: ADM, MECA), o curso é reconhecido
// pelo título e trocado pela sigla abaixo. O ANO continua separado: o sistema já mostra
// "1º ADM", "2º MECA"... juntando ano + nome (por isso o ano não entra no nome gravado).
const { semAcentos, chaveTurma } = require('./texto');

// Ordem importa: "Desenvolvimento de Sistemas" é testado antes de "Informática".
const CURSOS = [
  { sigla: 'DSE',  padrao: /desenvolvimento\s+de\s+sistemas|\bdes\.?\s*sist|\bdse\b/ },
  { sigla: 'MECA', padrao: /mecatr/ },
  { sigla: 'INFO', padrao: /inform[a]?tic|\binfo\b/ },
  { sigla: 'ADM',  padrao: /administra|\badm\b/ },
  { sigla: 'EDF',  padrao: /edifica|\bedf\b/ },
  { sigla: 'MKT',  padrao: /marketing|\bmkt\b/ },
];

// "Administração - Bariri" -> "adm"; devolve null se o curso não for reconhecido.
// (o banco guarda os nomes de turma em minúsculas)
function nomeCurto(nomePdf) {
  const t = semAcentos(nomePdf || '').toLowerCase();
  const achado = CURSOS.find((c) => c.padrao.test(t));
  return achado ? achado.sigla.toLowerCase() : null;
}

// Troca, em cada turma lida do PDF, o nome pela sigla do curso. Mantém o nome lido do PDF em
// `nome_pdf`. Se o banco já tem uma turma com o nome ANTIGO daquele ano, mantém o nome antigo
// para a importação continuar usando essa turma (não cria uma duplicada ao lado dela).
function aplicarNomesCurtos(dados, turmasBanco = []) {
  const existentes = new Set(turmasBanco.map((t) => chaveTurma(t.nome, t.ano)));
  for (const t of dados.turmas) {
    if (!t.nome || !t.ano) continue;
    const curto = nomeCurto(t.nome) || nomeCurto(t.titulo_original);
    if (!curto || curto === t.nome) continue;
    if (existentes.has(chaveTurma(t.nome, t.ano))) continue;
    t.nome_pdf = t.nome;
    t.nome = curto;
  }
  return dados;
}

module.exports = { nomeCurto, aplicarNomesCurtos, CURSOS };
