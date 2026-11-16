'use strict';

function chave(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const aliases = [
  ['professor', 'Evandro Amadeu', 'Evandro A.'],
  ['disciplina', 'Projetos de Tecnologia da Informação', 'TIVjTIVS UM Tecnologia da Informação'],
  ['disciplina', 'Projetos de Tecnologia da Informação', 'Tecnologia da ecn ia informação'],
  ['disciplina', 'Promoção de Vendas e Merchandising', 'Vendas e Merchandising'],
  ['disciplina', 'Banco de Dados II', 'Banco de Dados'],
  ['disciplina', 'Programação Web II', 'Web'],
];

module.exports = {
  id: '004_gabarito_correcao_pdf_tarde',
  descricao: 'Variações confirmadas pela coordenação no PDF de horários da tarde',

  async up(conn) {
    for (const [tipo, oficial, variacao] of aliases) {
      const [entidades] = await conn.query(
        'SELECT id FROM gabarito_entidades WHERE tipo = ? AND chave_normalizada = ? AND ativo = 1 LIMIT 1',
        [tipo, chave(oficial)]);
      if (!entidades.length) throw new Error(`Nome oficial ausente no gabarito: ${oficial}`);
      await conn.query(`INSERT IGNORE INTO gabarito_variacoes
        (entidade_id, tipo, variacao, chave_normalizada) VALUES (?, ?, ?, ?)`,
      [entidades[0].id, tipo, variacao, chave(variacao)]);
    }
  },
};
