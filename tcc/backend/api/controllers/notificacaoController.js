const pool = require('../config/db');

/**
 * ============================================================
 * DESTINATÁRIO DA NOTIFICAÇÃO
 * ============================================================
 *
 * O usuário autenticado pode ser:
 *
 * - turma
 * - professor
 *
 * As notificações lidas são registradas usando esse tipo + ID.
 */
function recipientFromUser(user) {
  if (user.tipo === 'turma') {
    return {
      tipo: 'turma',
      id: Number(user.id)
    };
  }

  if (user.tipo === 'professor') {
    return {
      tipo: 'professor',
      id: Number(user.id)
    };
  }

  return null;
}


/**
 * ============================================================
 * FILTRO DE DESTINO (SQL)
 * ============================================================
 *
 * Uma notificação pode ter vários destinos (tabela
 * notificacoes_destinos). O usuário recebe a notificação se
 * QUALQUER um dos destinos o alcança:
 *
 *   - 'todos'
 *   - 'professores' (se for professor) ou 'turmas' (se for turma)
 *   - 'professor' / 'turma' com o ID dele
 *
 * Retorna o trecho SQL (usa o alias "n" para notificacoes)
 * e os parâmetros na ordem correta.
 */
function filtroDestinoUsuario(usuario) {
  const ehTurma = usuario.tipo === 'turma';

  return {
    sql: `
      EXISTS (
        SELECT 1
        FROM notificacoes_destinos d
        WHERE d.notificacao_id = n.id
          AND (
            d.destino_tipo IN ('todos', ?)
            OR (d.destino_tipo = ? AND d.destino_id = ?)
          )
      )
    `,
    params: [
      ehTurma ? 'turmas' : 'professores',
      ehTurma ? 'turma' : 'professor',
      Number(usuario.id)
    ]
  };
}


/**
 * ============================================================
 * NORMALIZAR DESTINOS RECEBIDOS
 * ============================================================
 *
 * Formato novo (vários destinatários):
 *
 *   destinos: [
 *     { destino_tipo: 'professores' },
 *     { destino_tipo: 'professor', destino_id: 3 },
 *     { destino_tipo: 'professor', destino_id: 7 },
 *     { destino_tipo: 'turma',     destino_id: 2 }
 *   ]
 *
 * Também aceita { destino_tipo: 'professor', destino_ids: [3, 7] }.
 *
 * Formato antigo (continua funcionando):
 *
 *   destino_tipo: 'professor', destino_id: 3
 *
 * Retorna { destinos: [{ tipo, id }] } (sem repetições)
 * ou { erro: 'mensagem' }.
 */
const DESTINOS_GERAIS = ['todos', 'professores', 'turmas'];
const DESTINOS_ESPECIFICOS = ['professor', 'turma'];

function normalizarDestinos(body) {

  let itens;

  if (Array.isArray(body.destinos)) {
    itens = body.destinos;
  } else {
    // formato antigo: um único destino (destino_id pode ser um array)
    itens = [{
      destino_tipo: body.destino_tipo,
      destino_id: body.destino_id
    }];
  }

  if (!itens.length) {
    return { erro: 'Selecione ao menos um destinatário' };
  }

  const vistos = new Set();
  const destinos = [];

  for (const item of itens) {

    const tipo = item && item.destino_tipo;

    if (DESTINOS_GERAIS.includes(tipo)) {

      const chave = `${tipo}:0`;

      if (!vistos.has(chave)) {
        vistos.add(chave);
        destinos.push({ tipo, id: 0 });
      }

      continue;
    }

    if (!DESTINOS_ESPECIFICOS.includes(tipo)) {
      return { erro: 'Destinatário inválido' };
    }

    const brutos = []
      .concat(item.destino_ids ?? [])
      .concat(item.destino_id ?? []);

    const ids = brutos.filter(
      valor => valor !== '' && valor !== null && valor !== undefined
    );

    if (!ids.length) {
      return { erro: 'Selecione o destinatário específico' };
    }

    for (const valor of ids) {

      const id = Number(valor);

      if (!Number.isInteger(id) || id <= 0) {
        return { erro: 'ID do destinatário inválido' };
      }

      const chave = `${tipo}:${id}`;

      if (!vistos.has(chave)) {
        vistos.add(chave);
        destinos.push({ tipo, id });
      }
    }
  }

  return { destinos };
}



/**
 * ============================================================
 * LISTAR NOTIFICAÇÕES
 * ============================================================
 *
 * Retorna as notificações que pertencem ao usuário logado.
 *
 * TURMA recebe:
 *   - todos
 *   - turmas
 *   - turma + seu ID
 *
 * PROFESSOR recebe:
 *   - todos
 *   - professores
 *   - professor + seu ID
 */
async function listar(req, res) {

  try {

    const usuario = req.usuario;

    if (!usuario || !usuario.id || !usuario.tipo) {
      return res.status(401).json({
        error: 'Usuário não autenticado'
      });
    }

    const usuarioId = Number(usuario.id);

    // ========================================================
    // CONFIRMAR TIPO DE USUÁRIO
    // ========================================================

    if (!['turma', 'professor'].includes(usuario.tipo)) {

      return res.status(403).json({
        error: 'Tipo de usuário não possui notificações'
      });

    }

    const destinatarioTipo = usuario.tipo;
    const filtro = filtroDestinoUsuario(usuario);


    // ========================================================
    // BUSCAR NOTIFICAÇÕES
    // ========================================================

    const sql = `
      SELECT
        n.id,

        n.titulo AS title,

        n.mensagem AS message,

        n.tipo AS type,

        n.destino_tipo,

        n.destino_id,

        n.created_at AS createdAt,

        CASE
          WHEN l.id IS NULL THEN 0
          ELSE 1
        END AS \`read\`

      FROM notificacoes n

      LEFT JOIN notificacoes_lidas l
        ON l.notificacao_id = n.id
        AND l.destinatario_tipo = ?
        AND l.destinatario_id = ?

      WHERE
        ${filtro.sql}

      ORDER BY n.created_at DESC

      LIMIT 100
    `;


    const params = [
      destinatarioTipo,
      usuarioId,

      ...filtro.params
    ];


    console.log(
      '[notificações] Buscando notificações:',
      {
        usuarioId,
        usuarioTipo: usuario.tipo,
        params
      }
    );


    const [rows] = await pool.query(
      sql,
      params
    );


    // ========================================================
    // PADRONIZAR RETORNO
    // ========================================================

    const notificacoes = rows.map(row => ({
      id: row.id,

      title: row.title,

      message: row.message,

      type: row.type || 'info',

      destino_tipo: row.destino_tipo,

      destino_id: row.destino_id,

      createdAt: row.createdAt,

      read: Boolean(row.read)
    }));


    console.log(
      `[notificações] ${notificacoes.length} encontrada(s) para ${usuario.tipo} ${usuarioId}`
    );


    return res.json(notificacoes);


  } catch (err) {

    console.error(
      '[notificações] Erro ao listar:',
      err
    );

    return res.status(500).json({
      error: 'Erro ao listar notificações'
    });
  }
}


/**
 * ============================================================
 * CRIAR NOTIFICAÇÃO
 * ============================================================
 *
 * Usado principalmente pela coordenadora.
 *
 * Aceita VÁRIOS destinatários em "destinos" (veja
 * normalizarDestinos). O formato antigo com um único
 * destino_tipo/destino_id continua funcionando.
 */
async function criar(req, res) {

  let conn;

  try {

    const {
      titulo,
      mensagem,
      tipo = 'info'
    } = req.body;

    // Opcional: adicionar a notificação ao calendário
    const adicionarCalendario =
      req.body.adicionar_calendario === true ||
      req.body.adicionar_calendario === 'true';

    const eventoData = String(req.body.evento_data || '').trim();
    const eventoHora = String(req.body.evento_hora || '').trim();

    if (adicionarCalendario) {

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(eventoData) ||
        Number.isNaN(Date.parse(eventoData))
      ) {
        return res.status(400).json({
          error: 'Informe uma data válida para o calendário'
        });
      }

      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(eventoHora)) {
        return res.status(400).json({
          error: 'Informe um horário válido para o calendário'
        });
      }

    }


    // ========================================================
    // VALIDAR CAMPOS
    // ========================================================

    if (
      !titulo ||
      !String(titulo).trim()
    ) {

      return res.status(400).json({
        error: 'Informe o título da notificação'
      });

    }


    if (
      !mensagem ||
      !String(mensagem).trim()
    ) {

      return res.status(400).json({
        error: 'Informe a mensagem da notificação'
      });

    }


    // ========================================================
    // DESTINATÁRIOS (um ou vários)
    // ========================================================

    const resultado = normalizarDestinos(req.body);

    if (resultado.erro) {

      return res.status(400).json({
        error: resultado.erro
      });

    }

    const destinos = resultado.destinos;


    // ========================================================
    // CONFIRMAR QUE PROFESSORES/TURMAS ESPECÍFICOS EXISTEM
    // ========================================================

    const confirmar = [
      { tipo: 'professor', tabela: 'professores', nome: 'Professor' },
      { tipo: 'turma', tabela: 'turmas', nome: 'Turma' }
    ];

    for (const { tipo: tipoDestino, tabela, nome } of confirmar) {

      const ids = destinos
        .filter(d => d.tipo === tipoDestino)
        .map(d => d.id);

      if (!ids.length) continue;

      const [existentes] = await pool.query(
        `SELECT id FROM ${tabela} WHERE id IN (?)`,
        [ids]
      );

      if (existentes.length !== ids.length) {

        return res.status(400).json({
          error: `${nome} selecionado(a) não encontrado(a)`
        });

      }
    }


    // ========================================================
    // USUÁRIO QUE CRIOU
    // ========================================================

    if (
      !req.usuario ||
      !req.usuario.id
    ) {

      return res.status(401).json({
        error: 'Usuário não autenticado'
      });

    }


    const criadoPor =
      Number(req.usuario.id);


    // ========================================================
    // INSERIR NO BANCO (transação: notificação + destinos)
    // ========================================================

    /*
     * As colunas destino_tipo/destino_id de "notificacoes"
     * guardam só o primeiro destino (compatibilidade).
     * Quem decide quem recebe é a tabela notificacoes_destinos.
     */

    const primeiro = destinos[0];

    conn = await pool.getConnection();

    await conn.beginTransaction();

    const [result] = await conn.query(

      `
        INSERT INTO notificacoes
        (
          titulo,
          mensagem,
          tipo,
          destino_tipo,
          destino_id,
          criado_por
        )

        VALUES (?, ?, ?, ?, ?, ?)
      `,

      [
        String(titulo).trim(),

        String(mensagem).trim(),

        tipo || 'info',

        primeiro.tipo,

        primeiro.id || null,

        criadoPor
      ]

    );


    await conn.query(

      `
        INSERT INTO notificacoes_destinos
        (
          notificacao_id,
          destino_tipo,
          destino_id
        )

        VALUES ?
      `,

      [
        destinos.map(d => [
          result.insertId,
          d.tipo,
          d.id
        ])
      ]

    );

    // Evento no calendário (mesma transação da notificação)
    if (adicionarCalendario) {

      await conn.query(
        `
          INSERT INTO eventos
          (
            titulo,
            descricao,
            data_evento,
            hora_evento,
            notificacao_id,
            criado_por_tipo,
            criado_por_id
          )

          VALUES (?, ?, ?, ?, ?, 'professor', ?)
        `,
        [
          String(titulo).trim(),
          String(mensagem).trim(),
          eventoData,
          eventoHora,
          result.insertId,
          criadoPor
        ]
      );

    }

    await conn.commit();


    // ========================================================
    // BUSCAR NOTIFICAÇÃO CRIADA
    // ========================================================

    const [rows] = await pool.query(

      `
        SELECT
          id,

          titulo AS title,

          mensagem AS message,

          tipo AS type,

          destino_tipo,

          destino_id,

          created_at AS createdAt,

          0 AS \`read\`

        FROM notificacoes

        WHERE id = ?
      `,

      [result.insertId]

    );


    const notificacao = {
      ...rows[0],

      destinos: destinos.map(d => ({
        destino_tipo: d.tipo,
        destino_id: d.id || null
      }))
    };


    console.log(
      '[notificações] Notificação criada:',
      notificacao
    );


    // ========================================================
    // RETORNO
    // ========================================================

    return res.status(201).json(
      notificacao
    );


  } catch (err) {

    if (conn) {
      await conn.rollback().catch(() => {});
    }

    console.error(
      '[notificações] Erro ao criar:',
      err
    );

    return res.status(500).json({
      error: 'Erro ao criar notificação'
    });

  } finally {

    if (conn) {
      conn.release();
    }

  }
}


/**
 * ============================================================
 * MARCAR UMA NOTIFICAÇÃO COMO LIDA
 * ============================================================
 *
 * Usado quando o usuário clica em uma notificação específica
 * para visualizar o conteúdo dela.
 */
async function marcarLida(req, res) {

  try {

    const usuario = req.usuario;

    if (
      !usuario ||
      !usuario.id ||
      !usuario.tipo
    ) {

      return res.status(401).json({
        error: 'Usuário não autenticado'
      });

    }

    const destinatario =
      recipientFromUser(usuario);

    if (!destinatario) {

      return res.status(403).json({
        error: 'Tipo de usuário inválido'
      });

    }

    const notificacaoId =
      Number(req.params.id);

    if (
      !Number.isInteger(notificacaoId) ||
      notificacaoId <= 0
    ) {

      return res.status(400).json({
        error: 'ID de notificação inválido'
      });

    }

    // ========================================================
    // CONFIRMA QUE A NOTIFICAÇÃO EXISTE
    // ========================================================

    const [notificacoes] = await pool.query(
      'SELECT id FROM notificacoes WHERE id = ?',
      [notificacaoId]
    );

    if (!notificacoes.length) {

      return res.status(404).json({
        error: 'Notificação não encontrada'
      });

    }

    // ========================================================
    // REGISTRA COMO LIDA
    // ========================================================

    await pool.query(

      `
        INSERT IGNORE INTO notificacoes_lidas
        (
          notificacao_id,
          destinatario_tipo,
          destinatario_id
        )

        VALUES (?, ?, ?)
      `,

      [
        notificacaoId,
        destinatario.tipo,
        destinatario.id
      ]

    );

    console.log(
      `[notificações] Notificação ${notificacaoId} marcada como lida para ${usuario.tipo} ${usuario.id}`
    );

    return res.json({
      ok: true
    });

  } catch (err) {

    console.error(
      '[notificações] Erro ao marcar notificação como lida:',
      err
    );

    return res.status(500).json({
      error: 'Erro ao marcar notificação como lida'
    });

  }

}


/**
 * ============================================================
 * MARCAR TODAS COMO LIDAS
 * ============================================================
 */
async function marcarTodasLidas(req, res) {

  try {

    const usuario = req.usuario;


    if (
      !usuario ||
      !usuario.id ||
      !usuario.tipo
    ) {

      return res.status(401).json({
        error: 'Usuário não autenticado'
      });

    }


    const destinatario =
      recipientFromUser(usuario);


    if (!destinatario) {

      return res.status(403).json({
        error: 'Tipo de usuário inválido'
      });

    }


    const usuarioId =
      Number(usuario.id);


    // ========================================================
    // BUSCAR NOTIFICAÇÕES DO USUÁRIO
    // ========================================================

    const filtro = filtroDestinoUsuario(usuario);

    const [notificacoes] =
      await pool.query(

        `
          SELECT n.id

          FROM notificacoes n

          WHERE
            ${filtro.sql}
        `,

        filtro.params

      );


    // ========================================================
    // REGISTRAR COMO LIDAS
    // ========================================================

    if (notificacoes.length > 0) {

      const values =
        notificacoes.map(
          notificacao => [

            notificacao.id,

            destinatario.tipo,

            destinatario.id

          ]
        );


      await pool.query(

        `
          INSERT IGNORE INTO notificacoes_lidas
          (
            notificacao_id,
            destinatario_tipo,
            destinatario_id
          )

          VALUES ?
        `,

        [values]

      );

    }


    console.log(
      `[notificações] ${notificacoes.length} notificação(ões) marcada(s) como lida(s) para ${usuario.tipo} ${usuarioId}`
    );


    return res.json({
      ok: true,
      quantidade: notificacoes.length
    });


  } catch (err) {

    console.error(
      '[notificações] Erro ao marcar como lidas:',
      err
    );

    return res.status(500).json({
      error: 'Erro ao marcar notificações'
    });

  }

}


module.exports = {
  listar,
  criar,
  marcarLida,
  marcarTodasLidas,
  filtroDestinoUsuario
};