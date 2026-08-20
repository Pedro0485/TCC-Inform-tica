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
    // DEFINIR TIPO DE DESTINATÁRIO
    // ========================================================

    let destinatarioTipo;
    let destinosGerais;
    let destinoEspecifico;

    if (usuario.tipo === 'turma') {

      destinatarioTipo = 'turma';

      destinosGerais = [
        'todos',
        'turmas'
      ];

      destinoEspecifico = 'turma';

    } else if (usuario.tipo === 'professor') {

      destinatarioTipo = 'professor';

      destinosGerais = [
        'todos',
        'professores'
      ];

      destinoEspecifico = 'professor';

    } else {

      return res.status(403).json({
        error: 'Tipo de usuário não possui notificações'
      });

    }


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
        n.destino_tipo IN (?, ?)

        OR (
          n.destino_tipo = ?
          AND n.destino_id = ?
        )

      ORDER BY n.created_at DESC

      LIMIT 100
    `;


    const params = [
      destinatarioTipo,
      usuarioId,

      destinosGerais[0],
      destinosGerais[1],

      destinoEspecifico,
      usuarioId
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
 */
async function criar(req, res) {

  try {

    const {
      titulo,
      mensagem,
      destino_tipo,
      destino_id,
      tipo = 'info'
    } = req.body;


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


    const destinosValidos = [
      'todos',
      'professores',
      'turmas',
      'professor',
      'turma'
    ];


    if (
      !destinosValidos.includes(destino_tipo)
    ) {

      return res.status(400).json({
        error: 'Destinatário inválido'
      });

    }


    // ========================================================
    // DESTINO ESPECÍFICO
    // ========================================================

    const precisaId = [
      'professor',
      'turma'
    ].includes(destino_tipo);


    let destinoId = null;


    if (precisaId) {

      if (
        destino_id === undefined ||
        destino_id === null ||
        destino_id === ''
      ) {

        return res.status(400).json({
          error: 'Selecione o destinatário específico'
        });

      }


      destinoId = Number(destino_id);


      if (
        !Number.isInteger(destinoId) ||
        destinoId <= 0
      ) {

        return res.status(400).json({
          error: 'ID do destinatário inválido'
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
    // INSERIR NO BANCO
    // ========================================================

    const [result] = await pool.query(

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

        destino_tipo,

        destinoId,

        criadoPor
      ]

    );


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


    const notificacao = rows[0];


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

    console.error(
      '[notificações] Erro ao criar:',
      err
    );

    return res.status(500).json({
      error: 'Erro ao criar notificação'
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
    // FILTROS
    // ========================================================

    let destinosGerais;
    let destinoEspecifico;


    if (usuario.tipo === 'turma') {

      destinosGerais = [
        'todos',
        'turmas'
      ];

      destinoEspecifico = 'turma';

    } else {

      destinosGerais = [
        'todos',
        'professores'
      ];

      destinoEspecifico = 'professor';

    }


    // ========================================================
    // BUSCAR NOTIFICAÇÕES
    // ========================================================

    const [notificacoes] =
      await pool.query(

        `
          SELECT id

          FROM notificacoes

          WHERE
            destino_tipo IN (?, ?)

            OR (
              destino_tipo = ?
              AND destino_id = ?
            )
        `,

        [
          destinosGerais[0],
          destinosGerais[1],

          destinoEspecifico,
          usuarioId
        ]

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
  marcarTodasLidas
};