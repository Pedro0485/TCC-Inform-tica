'use strict';

// Avisa os professores quando o horário de aulas deles muda.
//
// Como funciona: antes da alteração tira-se uma "foto" das aulas de cada professor
// (capturar); depois da alteração compara-se com o estado novo (notificar). Só quem teve
// diferença recebe uma notificação (aparece no sino e no painel do professor).
// Qualquer falha aqui é apenas registrada no log: nunca desfaz a alteração das aulas.

const DIAS = { segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado' };
const ORDEM_DIA = Object.keys(DIAS);
const MAX_LINHAS = 6;

// Map<professorId, Map<"turma|dia|hora", aula>>
async function capturar(db, turmaIds) {
  if (Array.isArray(turmaIds) && turmaIds.length === 0) return new Map();
  const filtro = Array.isArray(turmaIds) ? 'WHERE a.turma_id IN (?)' : '';
  const params = Array.isArray(turmaIds) ? [turmaIds] : [];
  const [rows] = await db.query(
    `SELECT a.turma_id, a.dia_semana, TIME_FORMAT(a.hora_inicio, '%H:%i') AS hi,
            TIME_FORMAT(a.hora_fim, '%H:%i') AS hf, a.materia, t.nome AS turma_nome, t.ano AS turma_ano,
            ap.professor_id
       FROM aulas a JOIN turmas t ON t.id = a.turma_id
       JOIN aulas_professores ap ON ap.aula_id = a.id ${filtro}`, params);
  const mapa = new Map();
  for (const r of rows) {
    if (!mapa.has(r.professor_id)) mapa.set(r.professor_id, new Map());
    mapa.get(r.professor_id).set(`${r.turma_id}|${r.dia_semana}|${r.hi}`, r);
  }
  return mapa;
}

const nomeTurma = (a) => `${a.turma_ano}º ${String(a.turma_nome).charAt(0).toUpperCase()}${String(a.turma_nome).slice(1)}`;
const descricao = (a) => `${nomeTurma(a)} – ${DIAS[a.dia_semana] || a.dia_semana} ${a.hi} (${a.materia})`;

function compararProfessor(antes = new Map(), depois = new Map()) {
  const itens = [];
  for (const [k, n] of depois) {
    const v = antes.get(k);
    if (!v) itens.push({ ordem: n, texto: `Nova aula: ${descricao(n)}` });
    else if (v.materia !== n.materia || v.hf !== n.hf) {
      itens.push({ ordem: n, texto: v.materia !== n.materia
        ? `Aula alterada: ${nomeTurma(n)} – ${DIAS[n.dia_semana]} ${n.hi}, de ${v.materia} para ${n.materia}`
        : `Horário alterado: ${descricao(n)} agora termina às ${n.hf}` });
    }
  }
  for (const [k, v] of antes) {
    if (!depois.has(k)) itens.push({ ordem: v, texto: `Aula removida: ${descricao(v)}` });
  }
  itens.sort((x, y) => nomeTurma(x.ordem).localeCompare(nomeTurma(y.ordem))
    || ORDEM_DIA.indexOf(x.ordem.dia_semana) - ORDEM_DIA.indexOf(y.ordem.dia_semana)
    || x.ordem.hi.localeCompare(y.ordem.hi));
  return itens.map((i) => i.texto);
}

function montarMensagem(linhas) {
  const mostrar = linhas.slice(0, MAX_LINHAS);
  const resto = linhas.length - mostrar.length;
  if (resto > 0) mostrar.push(`… e mais ${resto} alteraç${resto > 1 ? 'ões' : 'ão'}. Veja em "Horários".`);
  return mostrar.join('\n');
}

async function criarParaProfessor(db, professorId, criadoPor, linhas) {
  const [r] = await db.query(
    `INSERT INTO notificacoes (titulo, mensagem, tipo, destino_tipo, destino_id, criado_por)
     VALUES (?, ?, 'horario', 'professor', ?, ?)`,
    ['Seu horário de aulas foi alterado', montarMensagem(linhas), professorId, criadoPor]);
  await db.query(
    `INSERT INTO notificacoes_destinos (notificacao_id, destino_tipo, destino_id) VALUES (?, 'professor', ?)`,
    [r.insertId, professorId]);
}

// Compara com a foto de antes e avisa os professores afetados. Devolve quantos foram avisados.
async function notificar(db, antes, criadoPor, turmaIds) {
  try {
    if (!antes || !criadoPor) return 0;
    const depois = await capturar(db, turmaIds);
    let avisados = 0;
    const ids = new Set([...antes.keys(), ...depois.keys()]);
    for (const id of ids) {
      const linhas = compararProfessor(antes.get(id), depois.get(id));
      if (linhas.length === 0) continue;
      await criarParaProfessor(db, id, criadoPor, linhas);
      avisados++;
    }
    return avisados;
  } catch (err) {
    console.error('[notificarAulas] não foi possível avisar os professores:', err.message);
    return 0;
  }
}

async function registrarImportacao(db, criadoPor, resultado) {
  try {
    if (!criadoPor) return false;
    const mensagem = `Importação concluída: ${resultado.aulas_importadas || 0} aulas gravadas em ${resultado.turmas_importadas || 0} turmas. Consulte Importar horários por PDF para ver o resultado.`;
    const [r] = await db.query(`INSERT INTO notificacoes (titulo, mensagem, tipo, destino_tipo, destino_id, criado_por) VALUES (?, ?, 'info', 'professor', ?, ?)`, ['Importação de aulas concluída', mensagem, criadoPor, criadoPor]);
    await db.query(`INSERT INTO notificacoes_destinos (notificacao_id, destino_tipo, destino_id) VALUES (?, 'professor', ?)`, [r.insertId, criadoPor]);
    return true;
  } catch (err) { console.error('[importacao] aviso de conclusão falhou:', err.message); return false; }
}

async function capturarSeguro(db, turmaIds) {
  try { return await capturar(db, turmaIds); }
  catch (err) { console.error('[notificarAulas] falha ao registrar estado anterior:', err.message); return null; }
}
module.exports = { capturar: capturarSeguro, notificar, registrarImportacao, compararProfessor, montarMensagem };
