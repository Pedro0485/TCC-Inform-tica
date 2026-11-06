const pool = require('../config/db');
const { filtroDestinoUsuario } = require('./notificacaoController');

/**
 * Eventos do calendário.
 *
 * Visibilidade:
 *  - evento manual (notificacao_id NULL): todos os usuários logados;
 *  - evento gerado por notificação: os destinatários da notificação
 *    (mesma regra de notificacoes_destinos) e a coordenação.
 *
 * Criação/edição/exclusão: apenas coordenadora (validado nas rotas e aqui).
 */

const CAMPOS = `
  e.id,
  e.titulo,
  e.descricao,
  DATE_FORMAT(e.data_evento, '%Y-%m-%d') AS data,
  TIME_FORMAT(e.hora_evento, '%H:%i') AS hora,
  e.notificacao_id,
  e.criado_por_tipo,
  e.criado_por_id
`;

function usuarioValido(usuario) {
  return Boolean(
    usuario &&
    usuario.id &&
    ['professor', 'turma'].includes(usuario.tipo)
  );
}

function ehCoordenadora(usuario) {
  return Boolean(usuario && usuario.tipo === 'professor' && usuario.admin);
}

function formatar(row, usuario) {
  const dono = ehCoordenadora(usuario);

  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao || '',
    data: row.data,
    hora: row.hora || null,
    notificacao_id: row.notificacao_id || null,
    editavel: dono
  };
}

// Valida e normaliza { titulo, descricao, data, hora }
function validarCampos(body) {
  const titulo = String(body.titulo || '').trim();
  const descricao = String(body.descricao || '').trim();
  const data = String(body.data || '').trim();
  const hora = body.hora ? String(body.hora).trim() : '';

  if (!titulo) return { erro: 'Informe o título do evento' };
  if (titulo.length > 150) return { erro: 'O título deve ter no máximo 150 caracteres' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data))) {
    return { erro: 'Data do evento inválida' };
  }

  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return { erro: 'Horário do evento inválido' };
  }

  return { valores: { titulo, descricao, data, hora: hora || null } };
}

async function buscarPorId(id) {
  const [rows] = await pool.query(
    `SELECT ${CAMPOS} FROM eventos e WHERE e.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function listar(req, res) {
  try {
    const usuario = req.usuario;

    if (!usuarioValido(usuario)) {
      return res.status(403).json({ error: 'Tipo de usuário não possui calendário' });
    }

    const filtro = filtroDestinoUsuario(usuario);

    const [rows] = await pool.query(
      `
        SELECT ${CAMPOS}
        FROM eventos e
        LEFT JOIN notificacoes n ON n.id = e.notificacao_id
        WHERE
          e.notificacao_id IS NULL
          OR ? = 1
          OR ${filtro.sql}
        ORDER BY e.data_evento, e.hora_evento, e.id
      `,
      [ehCoordenadora(usuario) ? 1 : 0, ...filtro.params]
    );

    return res.json(rows.map(r => formatar(r, usuario)));

  } catch (err) {
    console.error('[eventos] Erro ao listar:', err);
    return res.status(500).json({ error: 'Erro ao listar eventos' });
  }
}

async function criar(req, res) {
  try {
    const usuario = req.usuario;

    if (!ehCoordenadora(usuario)) {
      return res.status(403).json({ error: 'Acesso restrito à coordenadora' });
    }

    const resultado = validarCampos(req.body || {});

    if (resultado.erro) {
      return res.status(400).json({ error: resultado.erro });
    }

    const v = resultado.valores;

    const [result] = await pool.query(
      `
        INSERT INTO eventos
        (titulo, descricao, data_evento, hora_evento, criado_por_tipo, criado_por_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [v.titulo, v.descricao || null, v.data, v.hora, usuario.tipo, Number(usuario.id)]
    );

    const row = await buscarPorId(result.insertId);

    return res.status(201).json(formatar(row, usuario));

  } catch (err) {
    console.error('[eventos] Erro ao criar:', err);
    return res.status(500).json({ error: 'Erro ao criar evento' });
  }
}

async function carregarEditavel(req, res) {
  const usuario = req.usuario;

  if (!ehCoordenadora(usuario)) {
    res.status(403).json({ error: 'Acesso restrito à coordenadora' });
    return null;
  }

  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'ID de evento inválido' });
    return null;
  }

  const evento = await buscarPorId(id);

  if (!evento) {
    res.status(404).json({ error: 'Evento não encontrado' });
    return null;
  }

  return evento;
}

async function atualizar(req, res) {
  try {
    const evento = await carregarEditavel(req, res);
    if (!evento) return;

    const resultado = validarCampos(req.body || {});

    if (resultado.erro) {
      return res.status(400).json({ error: resultado.erro });
    }

    const v = resultado.valores;

    await pool.query(
      `
        UPDATE eventos
        SET titulo = ?, descricao = ?, data_evento = ?, hora_evento = ?
        WHERE id = ?
      `,
      [v.titulo, v.descricao || null, v.data, v.hora, evento.id]
    );

    const row = await buscarPorId(evento.id);

    return res.json(formatar(row, req.usuario));

  } catch (err) {
    console.error('[eventos] Erro ao atualizar:', err);
    return res.status(500).json({ error: 'Erro ao atualizar evento' });
  }
}

async function excluir(req, res) {
  try {
    const evento = await carregarEditavel(req, res);
    if (!evento) return;

    await pool.query('DELETE FROM eventos WHERE id = ?', [evento.id]);

    return res.json({ ok: true });

  } catch (err) {
    console.error('[eventos] Erro ao excluir:', err);
    return res.status(500).json({ error: 'Erro ao excluir evento' });
  }
}

module.exports = { listar, criar, atualizar, excluir };
