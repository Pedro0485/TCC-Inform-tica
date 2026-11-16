const bcrypt = require('bcrypt');
const { loginUnico, emailDoLogin } = require('../../utils/loginProfessor');
// Acesso ao banco da importação. A gravação definitiva é UMA transação: ou grava tudo
// (turmas, professores, aulas) ou não grava nada.
const crypto = require('crypto');
const { ErroImportacao, ETAPAS } = require('./erros');
const { chaveNome, chaveTurma } = require('./texto');

const COLUNAS_STATUS = `id, criado_por, nome_original, arquivo_sha256, tamanho_bytes, status, etapa, progresso,
  mensagem, erro_codigo, erro_mensagem, total_turmas, total_aulas_encontradas, total_aulas_importadas,
  criado_em, atualizado_em, confirmada_em`;

async function criar(pool, { criadoPor, nomeOriginal, sha256, tamanho }) {
  const [r] = await pool.query(
    `INSERT INTO importacoes_horarios (criado_por, nome_original, arquivo_sha256, tamanho_bytes, etapa, mensagem)
     VALUES (?, ?, ?, ?, 'leitura_pdf', 'Na fila')`,
    [criadoPor, String(nomeOriginal).slice(0, 255), sha256, tamanho]);
  return r.insertId;
}

async function atualizarProgresso(pool, id, { etapa, pct, mensagem }) {
  await pool.query(
    `UPDATE importacoes_horarios SET etapa = ?, progresso = ?, mensagem = ? WHERE id = ? AND status = 'processando'`,
    [String(etapa).slice(0, 30), Math.max(0, Math.min(100, Number(pct) || 0)), String(mensagem || '').slice(0, 255), id]);
}

async function marcarPronta(pool, id, dados) {
  const aulas = dados.turmas.reduce((s, t) => s + t.aulas.length, 0);
  await pool.query(
    `UPDATE importacoes_horarios SET status = 'pronta', etapa = 'pre_visualizacao', progresso = 100,
       mensagem = 'Leitura concluída. Confira os dados antes de importar.', dados_json = ?,
       total_turmas = ?, total_aulas_encontradas = ?, erro_codigo = NULL, erro_mensagem = NULL
     WHERE id = ?`, [JSON.stringify(dados), dados.turmas.length, aulas, id]);
}

async function marcarFalha(pool, id, { etapa, codigo, mensagem }) {
  await pool.query(
    `UPDATE importacoes_horarios SET status = 'falhou', etapa = ?, erro_codigo = ?, erro_mensagem = ?,
       mensagem = 'A importação falhou.' WHERE id = ? AND status IN ('processando','pronta')`,
    [String(etapa).slice(0, 30), String(codigo).slice(0, 60), String(mensagem).slice(0, 500), id]);
}

async function cancelar(pool, id) {
  const [r] = await pool.query(
    `UPDATE importacoes_horarios SET status = 'cancelada', mensagem = 'Cancelada pela coordenadora.', dados_json = NULL
      WHERE id = ? AND status IN ('processando','pronta')`, [id]);
  return r.affectedRows > 0;
}

async function obterStatus(pool, id) {
  const [rows] = await pool.query(`SELECT ${COLUNAS_STATUS} FROM importacoes_horarios WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function obterComDados(pool, id) {
  const [rows] = await pool.query(`SELECT ${COLUNAS_STATUS}, dados_json FROM importacoes_horarios WHERE id = ? LIMIT 1`, [id]);
  if (!rows[0]) return null;
  const r = rows[0];
  r.dados = r.dados_json ? JSON.parse(r.dados_json) : null;
  delete r.dados_json;
  return r;
}

async function listarHistorico(pool, limite = 20) {
  const [rows] = await pool.query(
    `SELECT ${COLUNAS_STATUS} FROM importacoes_horarios ORDER BY id DESC LIMIT ?`, [Math.min(Number(limite) || 20, 100)]);
  return rows;
}

async function jaImportadoAntes(pool, sha256) {
  const [rows] = await pool.query(
    `SELECT id, confirmada_em FROM importacoes_horarios WHERE arquivo_sha256 = ? AND status = 'confirmada'
      ORDER BY id DESC LIMIT 1`, [sha256]);
  return rows[0] || null;
}

async function marcarTravadasComoFalhas(pool) {
  await pool.query(
    `UPDATE importacoes_horarios SET status = 'falhou', etapa = 'comunicacao_servicos',
       erro_codigo = 'SERVIDOR_REINICIADO', erro_mensagem = 'O servidor foi reiniciado durante o processamento. Envie o PDF novamente.',
       mensagem = 'A importação falhou.' WHERE status = 'processando'`);
}

async function carregarCadastros(pool) {
  const [turmas] = await pool.query('SELECT id, nome, ano, turno FROM turmas');
  const [professores] = await pool.query('SELECT id, nome, email FROM professores');
  return { turmas, professores };
}

async function coordenadoraAtiva(pool, id) {
  const [rows] = await pool.query('SELECT admin FROM professores WHERE id = ? LIMIT 1', [id]);
  return rows.length === 1 && rows[0].admin === 1;
}

function gerarCodigo() {
  return String(crypto.randomInt(100000, 1000000)); // 6 dígitos, mesmo formato numérico usado no login do aluno
}

// ------------------------------------------------------------------ gravação
// plano: [{ destino_id | nova:{nome,ano,turno}, aulas:[{dia_semana,hora_inicio,hora_fim,materia,professores}] }]
async function gravar(pool, importacaoId, plano, { criarTurmas }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // trava a linha: duas confirmações simultâneas da mesma importação não gravam duas vezes
    const [lin] = await conn.query('SELECT id, status FROM importacoes_horarios WHERE id = ? FOR UPDATE', [importacaoId]);
    if (!lin[0]) throw new ErroImportacao('Importação não encontrada.', { etapa: ETAPAS.GRAVACAO, codigo: 'NAO_ENCONTRADA', status: 404 });
    if (lin[0].status === 'confirmada') {
      throw new ErroImportacao('Esta importação já foi concluída. Nada foi gravado novamente.', { etapa: ETAPAS.GRAVACAO, codigo: 'JA_CONFIRMADA', status: 409 });
    }
    if (lin[0].status !== 'pronta') {
      throw new ErroImportacao('Esta importação não está pronta para ser confirmada.', { etapa: ETAPAS.GRAVACAO, codigo: 'STATUS_INVALIDO', status: 409 });
    }

    // professores: reaproveita os existentes (sem diferenciar acento/maiúscula); cria só os que faltam
    const [existentes] = await conn.query('SELECT id, nome FROM professores');
    const profPorChave = new Map(existentes.map((p) => [chaveNome(p.nome), p.id]));
    const nomesNecessarios = new Map();
    for (const t of plano) for (const a of t.aulas) for (const n of a.professores) {
      if (!nomesNecessarios.has(chaveNome(n))) nomesNecessarios.set(chaveNome(n), n);
    }
    let professoresCriados = 0;
    // login automático nome.sobrenome (senha provisória igual); o professor troca no 1º acesso
    const emailsUsados = new Set((await conn.query('SELECT email FROM professores WHERE email IS NOT NULL'))[0].map((r) => r.email));
    for (const [k, nome] of nomesNecessarios) {
      if (!profPorChave.has(k)) {
        try {
          const login = loginUnico(nome, emailsUsados);
          const senhaHash = await bcrypt.hash(login, 10);
          const [r] = await conn.query(
            'INSERT INTO professores (nome, email, senha, admin) VALUES (?, ?, ?, 0)',
            [nome, emailDoLogin(login), senhaHash]);
          profPorChave.set(k, r.insertId);
          professoresCriados++;
        } catch (e) {
          if (e.code !== 'ER_DUP_ENTRY') throw e;
          const [ex] = await conn.query('SELECT id FROM professores WHERE nome = ? LIMIT 1', [nome]);
          if (!ex[0]) throw e;
          profPorChave.set(k, ex[0].id);
        }
      }
    }

    // turmas: usa a existente ou cria (código de acesso gerado, único)
    const [turmasBanco] = await conn.query('SELECT id, nome, ano FROM turmas');
    const turmaPorChave = new Map(turmasBanco.map((t) => [chaveTurma(t.nome, t.ano), t.id]));
    const codigosUsados = new Set((await conn.query('SELECT codigo FROM turmas'))[0].map((r) => r.codigo));
    const criadas = [];
    const idsAfetados = [];
    for (const t of plano) {
      let id = t.destino_id;
      if (!id) {
        if (!criarTurmas) throw new ErroImportacao('Turma não cadastrada.', { etapa: ETAPAS.GRAVACAO, codigo: 'TURMA_NAO_CADASTRADA' });
        id = turmaPorChave.get(chaveTurma(t.nova.nome, t.nova.ano));
        if (!id) {
          let codigo; do { codigo = gerarCodigo(); } while (codigosUsados.has(codigo));
          codigosUsados.add(codigo);
          const [r] = await conn.query('INSERT INTO turmas (nome, ano, codigo, turno) VALUES (?, ?, ?, ?)',
            [t.nova.nome, t.nova.ano, codigo, t.nova.turno]);
          id = r.insertId;
          turmaPorChave.set(chaveTurma(t.nova.nome, t.nova.ano), id);
          criadas.push({ id, nome: t.nova.nome, ano: t.nova.ano, turno: t.nova.turno, codigo });
        }
      }
      t.turma_id = id;
      idsAfetados.push(id);
    }

    // guarda o que vai ser substituído (recuperação manual) e só então substitui
    const snapshot = [];
    if (idsAfetados.length) {
      const [antigas] = await conn.query(
        `SELECT a.turma_id, a.dia_semana, a.hora_inicio, a.hora_fim, a.materia,
                GROUP_CONCAT(p.nome ORDER BY p.nome SEPARATOR '; ') AS professores
           FROM aulas a LEFT JOIN aulas_professores ap ON ap.aula_id = a.id
           LEFT JOIN professores p ON p.id = ap.professor_id
          WHERE a.turma_id IN (?) GROUP BY a.id`, [idsAfetados]);
      snapshot.push(...antigas);
      // Preserva as aulas atuais; confirmações são aditivas.
    }

    let totalAulas = 0;
    let aulasReutilizadas = 0;
    let aulasNovas = 0;
    for (const t of plano) {
      if (t.aulas.length === 0) continue;
      const vinculos = [];
      for (const a of t.aulas) {
        const [rows] = await conn.query('SELECT id, materia, TIME_FORMAT(hora_fim, \'%H:%i\') AS hf FROM aulas WHERE turma_id = ? AND dia_semana = ? AND hora_inicio = ? LIMIT 1', [t.turma_id, a.dia_semana, a.hora_inicio]);
        let aulaId;
        let substituida = false;
        if (rows.length) {
          aulaId = rows[0].id;
          if (rows[0].hf !== a.hora_fim || String(rows[0].materia).trim().toLocaleLowerCase() !== String(a.materia).trim().toLocaleLowerCase()) {
            // horário já cadastrado com outra matéria/fim: o PDF importado prevalece (antes abortava a importação inteira)
            await conn.query('UPDATE aulas SET hora_fim = ?, materia = ?, importacao_id = ? WHERE id = ?', [a.hora_fim, a.materia, importacaoId, aulaId]);
            await conn.query('DELETE FROM aulas_professores WHERE aula_id = ?', [aulaId]);
            substituida = true;
            aulasNovas++;
          } else {
            aulasReutilizadas++;
          }
        } else {
          const [r] = await conn.query('INSERT INTO aulas (turma_id, dia_semana, hora_inicio, hora_fim, materia, importacao_id) VALUES (?, ?, ?, ?, ?, ?)', [t.turma_id, a.dia_semana, a.hora_inicio, a.hora_fim, a.materia, importacaoId]);
          aulaId = r.insertId;
          aulasNovas++;
        }
        const [vinculados] = await conn.query('SELECT professor_id FROM aulas_professores WHERE aula_id = ?', [aulaId]);
        const ids = new Set(vinculados.map((x) => x.professor_id));
        for (const nome of a.professores) { const pid = profPorChave.get(chaveNome(nome)); if (pid && !ids.has(pid)) { vinculos.push([aulaId, pid]); ids.add(pid); } }
      }
      if (vinculos.length) await conn.query('INSERT INTO aulas_professores (aula_id, professor_id) VALUES ?', [vinculos]);
      totalAulas += t.aulas.length;
    }

    const ids0 = idsAfetados.length ? idsAfetados : [0];
    const [verificacaoTurmas] = await conn.query('SELECT COUNT(*) AS n FROM turmas WHERE id IN (?)', [ids0]);
    const [verificacaoAulas] = await conn.query('SELECT COUNT(*) AS n FROM aulas WHERE turma_id IN (?)', [ids0]);
    if (Number(verificacaoTurmas[0].n) !== idsAfetados.length || Number(verificacaoAulas[0].n) < totalAulas) {
      throw new ErroImportacao('A gravação não foi confirmada: turmas ou aulas não ficaram disponíveis no banco usado pela tela Salas.', { etapa: ETAPAS.GRAVACAO, codigo: 'VERIFICACAO_POS_GRAVACAO', status: 500 });
    }
    const resultado = { turmas_importadas: plano.length, turmas_criadas: criadas, professores_criados: professoresCriados,
      aulas_importadas: aulasNovas, aulas_total_processadas: totalAulas, aulas_existentes_preservadas: snapshot.length, aulas_reutilizadas: aulasReutilizadas,
      turmas_afetadas: [...new Set(idsAfetados)] };
    await conn.query(
      `UPDATE importacoes_horarios SET status = 'confirmada', etapa = 'concluida', progresso = 100,
         mensagem = 'Importação concluída.', total_aulas_importadas = ?, snapshot_anterior = ?, resultado_json = ?,
         confirmada_em = NOW() WHERE id = ?`,
      [totalAulas, JSON.stringify(snapshot), JSON.stringify(resultado), importacaoId]);
    await conn.commit();
    return resultado;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* conexão já caiu */ }
    if (err instanceof ErroImportacao) throw err;
    console.error('[importacao] erro na gravação:', err.code || '', err.message);
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(err.code)) {
      throw new ErroImportacao('O banco ainda não está preparado para importar horários. Na pasta backend, execute npm run db:schema e depois npm run db:migrate; reinicie o servidor e tente novamente.', { etapa: ETAPAS.GRAVACAO, codigo: 'MIGRACAO_PENDENTE', status: 503 });
    }
    throw new ErroImportacao('Erro ao gravar no banco de dados. Nada foi alterado.',
      { etapa: ETAPAS.GRAVACAO, codigo: err.code === 'ER_DUP_ENTRY' ? 'REGISTRO_DUPLICADO' : 'ERRO_BANCO', status: 500 });
  } finally {
    conn.release();
  }
}

async function contarAulasPorTurma(pool) {
  const [rows] = await pool.query('SELECT turma_id, COUNT(*) AS n FROM aulas GROUP BY turma_id');
  return new Map(rows.map((r) => [r.turma_id, r.n]));
}

// Falha na gravação: a transação já foi desfeita e a importação continua "pronta"
// (a coordenadora pode tentar de novo); só registra o motivo para consulta.
async function registrarErroGravacao(pool, id, { codigo, mensagem }) {
  await pool.query(
    `UPDATE importacoes_horarios SET etapa = 'gravacao_banco', erro_codigo = ?, erro_mensagem = ?
      WHERE id = ? AND status = 'pronta'`, [String(codigo).slice(0, 60), String(mensagem).slice(0, 500), id]);
}

module.exports = { contarAulasPorTurma, registrarErroGravacao, criar, atualizarProgresso, marcarPronta, marcarFalha, cancelar, obterStatus, obterComDados,
  listarHistorico, jaImportadoAntes, marcarTravadasComoFalhas, carregarCadastros, coordenadoraAtiva, gravar };











