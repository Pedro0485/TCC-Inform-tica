'use strict';

function chave(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const correcoes = [
  ['Keues ul Comunicação de Dados TÁ ITR', 'Redes de Comunicação de Dados - TA / TB'],
  ['Keues ul Comunicação de Dados II TÁ IB', 'Redes de Comunicação de Dados - TA / TB'],
  ['Tec. da Infor. Adm TA - TB', 'Tec. da Infor. Adm TA - TB'],
];

module.exports = {
  id: '006_confirmacoes_manha',
  descricao: 'Confirmações da coordenação para horários da manhã',
  async up(conn) {
    await conn.query(`INSERT IGNORE INTO gabarito_entidades
      (tipo, nome_oficial, chave_normalizada, ativo, origem)
      VALUES ('professor', 'Jacqueline', ?, 1, 'manual')`, [chave('Jacqueline')]);
    for (const [origem, corrigido] of correcoes) {
      await conn.query(`INSERT INTO gabarito_correcoes_exatas
        (tipo, texto_origem, chave_origem, texto_corrigido, ativo)
        VALUES ('disciplina', ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE texto_origem = VALUES(texto_origem), texto_corrigido = VALUES(texto_corrigido), ativo = 1`,
      [origem, chave(origem), corrigido]);
    }
  },
};
