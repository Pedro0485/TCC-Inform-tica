'use strict';

const pool = require('../config/db');

function classificar(req) {
  const metodo = req.method;
  const caminho = String(req.originalUrl || req.url || '').split('?')[0];
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) return null;

  if (caminho === '/admin/dados/excluir' && metodo === 'POST') {
    return { entidade: 'Dados do sistema', acao: 'Removeu dados' };
  }
  if (/^\/importacoes\/horarios\/[^/]+\/confirmar$/.test(caminho) && metodo === 'POST') {
    return { entidade: 'Importação de horários', acao: 'Importou horários' };
  }
  if (caminho === '/notificacoes' && metodo === 'POST') {
    return { entidade: 'Notificação', acao: 'Criou notificação' };
  }
  if (caminho.startsWith('/eventos')) {
    return { entidade: 'Evento', acao: verbo(metodo) };
  }
  if (/^\/professor(?:\/|$)/.test(caminho) && !caminho.startsWith('/professor/me')) {
    return { entidade: 'Professor', acao: verbo(metodo) };
  }
  if (caminho.startsWith('/turmas/materias/')) {
    return { entidade: 'Atribuição de matéria', acao: verbo(metodo) };
  }
  if (/^\/turmas\/\d+\/horarios$/.test(caminho)) {
    return { entidade: 'Horários da turma', acao: 'Atualizou horários' };
  }
  if (caminho === '/turmas' || /^\/turmas\/\d+$/.test(caminho)) {
    return { entidade: 'Turma', acao: verbo(metodo) };
  }
  return null;
}

function verbo(metodo) {
  if (metodo === 'POST') return 'Criou';
  if (metodo === 'DELETE') return 'Excluiu';
  return 'Atualizou';
}

function detalhes(req, atividade) {
  const corpo = req.body || {};
  if (atividade.entidade === 'Dados do sistema') {
    const itens = Array.isArray(corpo.selecionados) ? corpo.selecionados.join(', ') : '';
    return itens ? `Escopo: ${itens}` : 'Limpeza de dados concluída';
  }
  if (atividade.entidade === 'Importação de horários') {
    const total = Array.isArray(corpo.turmas) ? corpo.turmas.length : 0;
    return total ? `Importação confirmada para ${total} turma(s)` : 'Importação por PDF confirmada';
  }

  const nome = [corpo.nome, corpo.nome_turma, corpo.titulo, corpo.curso]
    .find((valor) => typeof valor === 'string' && valor.trim());
  if (nome) return `${atividade.acao}: ${nome.trim().slice(0, 180)}`;

  const id = req.params?.id || String(req.originalUrl || '').match(/\/(\d+)(?:\/|$)/)?.[1];
  if (id) return `${atividade.acao} ${atividade.entidade.toLowerCase()} #${id}`;
  return `${atividade.acao} ${atividade.entidade.toLowerCase()}`;
}

function middleware(req, res, next) {
  res.on('finish', () => {
    const usuario = req.usuario;
    const atividade = classificar(req);
    if (!atividade || res.statusCode < 200 || res.statusCode >= 300) return;
    if (!usuario || usuario.tipo !== 'professor' || !usuario.admin) return;

    pool.query(
      `INSERT INTO auditoria_atividade (usuario_id, usuario_nome, acao, entidade, detalhes)
       VALUES (?, ?, ?, ?, ?)`,
      [Number(usuario.id) || null, String(usuario.nome || 'Coordenação').slice(0, 150), atividade.acao, atividade.entidade, detalhes(req, atividade).slice(0, 255)]
    ).then(() => pool.query('DELETE FROM auditoria_atividade WHERE created_at < DATE_SUB(NOW(), INTERVAL 180 DAY)'))
      .catch((err) => console.error('[auditoria] Não foi possível registrar a alteração:', err.message));
  });
  next();
}

module.exports = { middleware };
