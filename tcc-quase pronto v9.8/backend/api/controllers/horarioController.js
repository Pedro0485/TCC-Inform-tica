// Consulta dos horários já gravados (somente leitura).
//   GET /horarios/turma/:id      aluno (só a própria turma, ou "me"), professor e coordenadora
//   GET /horarios/professor/:id  professor (só os próprios, ou "me") e coordenadora (qualquer um)
const pool = require('../config/db');

const DIAS_ORDEM = "FIELD(a.dia_semana,'segunda','terca','quarta','quinta','sexta','sabado')";
const HORAS = "TIME_FORMAT(a.hora_inicio, '%H:%i') AS hora_inicio, TIME_FORMAT(a.hora_fim, '%H:%i') AS hora_fim";

function resolverId(param, usuario) {
  if (param === 'me') return usuario.id;
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function professoresDasAulas(ids) {
  if (!ids.length) return new Map();
  const [rows] = await pool.query(
    `SELECT ap.aula_id, p.id, p.nome FROM aulas_professores ap JOIN professores p ON p.id = ap.professor_id
      WHERE ap.aula_id IN (?) ORDER BY p.nome`, [ids]);
  const mapa = new Map();
  for (const r of rows) {
    if (!mapa.has(r.aula_id)) mapa.set(r.aula_id, []);
    mapa.get(r.aula_id).push({ id: r.id, nome: r.nome });
  }
  return mapa;
}

async function porTurma(req, res) {
  try {
    const id = resolverId(req.params.id, req.usuario);
    if (!id) return res.status(400).json({ error: 'Identificador inválido' });
    // aluno (token de turma) só enxerga a própria turma
    if (req.usuario.tipo === 'turma' && req.usuario.id !== id) {
      return res.status(403).json({ error: 'Você só pode consultar os horários da sua turma' });
    }
    const [turmas] = await pool.query('SELECT id, nome, ano, turno FROM turmas WHERE id = ? LIMIT 1', [id]);
    if (!turmas[0]) return res.status(404).json({ error: 'Turma não encontrada' });
    const [aulas] = await pool.query(
      `SELECT a.id, a.dia_semana, ${HORAS}, a.materia FROM aulas a WHERE a.turma_id = ?
        ORDER BY ${DIAS_ORDEM}, a.hora_inicio`, [id]);
    const profs = await professoresDasAulas(aulas.map((a) => a.id));
    return res.json({ turma: turmas[0], aulas: aulas.map((a) => ({ ...a, professores: profs.get(a.id) || [] })) });
  } catch (err) {
    console.error('[horarios] porTurma:', err.code || err.message);
    return res.status(500).json({ error: 'Erro ao consultar horários' });
  }
}

async function porProfessor(req, res) {
  try {
    if (req.usuario.tipo !== 'professor') return res.status(403).json({ error: 'Acesso restrito a professores' });
    const id = resolverId(req.params.id, req.usuario);
    if (!id) return res.status(400).json({ error: 'Identificador inválido' });
    if (!req.usuario.admin && req.usuario.id !== id) {
      return res.status(403).json({ error: 'Você só pode consultar os seus próprios horários' });
    }
    const [profs] = await pool.query('SELECT id, nome FROM professores WHERE id = ? LIMIT 1', [id]);
    if (!profs[0]) return res.status(404).json({ error: 'Professor não encontrado' });
    const [aulas] = await pool.query(
      `SELECT a.id, a.dia_semana, ${HORAS}, a.materia, t.id AS turma_id, t.nome AS turma_nome, t.ano AS turma_ano
         FROM aulas a JOIN aulas_professores ap ON ap.aula_id = a.id JOIN turmas t ON t.id = a.turma_id
        WHERE ap.professor_id = ? ORDER BY ${DIAS_ORDEM}, a.hora_inicio, t.nome`, [id]);
    return res.json({ professor: profs[0], aulas });
  } catch (err) {
    console.error('[horarios] porProfessor:', err.code || err.message);
    return res.status(500).json({ error: 'Erro ao consultar horários' });
  }
}

module.exports = { porTurma, porProfessor };
