const pool = require('../config/db');

function recipientFromUser(user) {
  return user.tipo === 'turma'
    ? { tipo: 'turma', id: Number(user.id) }
    : { tipo: 'professor', id: Number(user.id) };
}

async function listar(req, res) {
  try {
    const u = req.usuario;
    const isTurma = u.tipo === 'turma';
    const params = isTurma ? ['todos', 'turmas', 'turma', u.id] : ['todos', 'professores', 'professor', u.id];
    const [rows] = await pool.query(`
      SELECT n.id, n.titulo AS title, n.mensagem AS message, n.tipo AS type,
             n.destino_tipo, n.destino_id, n.created_at AS createdAt,
             CASE WHEN l.id IS NULL THEN 0 ELSE 1 END AS \`read\`
      FROM notificacoes n
      LEFT JOIN notificacoes_lidas l
        ON l.notificacao_id = n.id AND l.destinatario_tipo = ? AND l.destinatario_id = ?
      WHERE n.destino_tipo IN (?, ?)
         OR (n.destino_tipo = ? AND n.destino_id = ?)
      ORDER BY n.created_at DESC
      LIMIT 100`,
      [isTurma ? 'turma' : 'professor', u.id, ...params]
    );
    res.json(rows.map(r => ({ ...r, read: !!r.read })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar notificações' });
  }
}

async function criar(req, res) {
  try {
    const { titulo, mensagem, destino_tipo, destino_id, tipo = 'info' } = req.body;
    const validos = ['todos', 'professores', 'turmas', 'professor', 'turma'];
    if (!titulo || !mensagem || !validos.includes(destino_tipo)) {
      return res.status(400).json({ error: 'Preencha título, mensagem e destinatário corretamente' });
    }
    const precisaId = ['professor', 'turma'].includes(destino_tipo);
    if (precisaId && !destino_id) return res.status(400).json({ error: 'Selecione o destinatário específico' });

    const [result] = await pool.query(
      `INSERT INTO notificacoes (titulo, mensagem, tipo, destino_tipo, destino_id, criado_por)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [String(titulo).trim(), String(mensagem).trim(), tipo, destino_tipo, precisaId ? destino_id : null, req.usuario.id]
    );
    const [rows] = await pool.query('SELECT * FROM notificacoes WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar notificação' });
  }
}

async function marcarTodasLidas(req, res) {
  try {
    const u = req.usuario;
    const rec = recipientFromUser(u);
    const isTurma = u.tipo === 'turma';
    const [notifs] = await pool.query(`
      SELECT id FROM notificacoes
      WHERE destino_tipo IN (?, ?)
         OR (destino_tipo = ? AND destino_id = ?)`,
      isTurma ? ['todos','turmas','turma',u.id] : ['todos','professores','professor',u.id]
    );
    if (notifs.length) {
      const values = notifs.map(n => [n.id, rec.tipo, rec.id]);
      await pool.query(
        `INSERT IGNORE INTO notificacoes_lidas (notificacao_id, destinatario_tipo, destinatario_id) VALUES ?`,
        [values]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao marcar notificações' });
  }
}

module.exports = { listar, criar, marcarTodasLidas };
