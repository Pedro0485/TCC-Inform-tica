// Utilitários dos testes. Os testes de banco/HTTP usam o MESMO .env/variáveis do projeto,
// mas só rodam se DB_NAME contiver "test" (nunca apagam dados reais por engano).
const pool = require('../config/db');

function bancoDeTeste() {
  return /test/i.test(process.env.DB_NAME || '');
}

async function bancoDisponivel() {
  if (!bancoDeTeste()) return false;
  try { await pool.query('SELECT 1 FROM importacoes_horarios LIMIT 1'); return true; } catch (_) { return false; }
}

async function limparTudo() {
  if (!bancoDeTeste()) throw new Error('Recusado: DB_NAME não parece um banco de teste.');
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['aulas_professores', 'aulas', 'importacoes_horarios', 'turmas', 'professores']) {
    await pool.query(`TRUNCATE TABLE ${t}`);
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function criarCoordenadora(nome = 'Coordenadora Teste') {
  const [r] = await pool.query(
    "INSERT INTO professores (nome, email, senha, admin) VALUES (?, 'coord@teste.local', 'x', 1)", [nome]);
  return r.insertId;
}

// Leitura sintética no formato que o Python entrega (versão 1).
function aula(dia, ini, fim, materia, profs, extra = {}) {
  return { dia_semana: dia, hora_inicio: ini, hora_fim: fim, materia, professores: profs, grupos: [],
    confianca: 0.95, requer_revisao: false, motivos_revisao: [], alertas: [],
    origem: { pagina: 1, linha: extra.linha ?? 0, coluna: extra.coluna ?? 0 }, ...extra.resto };
}
function turma(pagina, titulo, ano, nome, aulas, extra = {}) {
  return { pagina, titulo_original: titulo, ano, nome, turno_sugerido: 'noturno', aulas,
    periodos_bloqueados: [], alertas: [], linhas_horario: [], horarios_para_conferir: false, ...extra };
}
function leitura(turmas, professores = []) {
  return { versao_esquema: 1, arquivo: { sha256: 'a'.repeat(64), paginas: turmas.length }, turmas,
    professores, correcoes: [], alertas: [], resumo: {} };
}
async function inserirImportacaoPronta(dados, criadoPor) {
  const [r] = await pool.query(
    `INSERT INTO importacoes_horarios (criado_por, nome_original, arquivo_sha256, tamanho_bytes, status, etapa, dados_json)
     VALUES (?, 'teste.pdf', ?, 100, 'pronta', 'pre_visualizacao', ?)`, [criadoPor, dados.arquivo.sha256, JSON.stringify(dados)]);
  return r.insertId;
}
async function contagens() {
  const q = async (t) => (await pool.query(`SELECT COUNT(*) n FROM ${t}`))[0][0].n;
  return { turmas: await q('turmas'), professores: await q('professores'), aulas: await q('aulas'), vinculos: await q('aulas_professores') };
}

module.exports = { pool, bancoDisponivel, limparTudo, criarCoordenadora, aula, turma, leitura, inserirImportacaoPronta, contagens };
