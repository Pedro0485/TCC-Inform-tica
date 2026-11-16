'use strict';

function chave(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const correcoes = [
  ['M es', 'Matemática'],
  ['Projetos Tec. da Info ão e Com. - TÁ ITB', 'Projetos Tec. da Informação e Com. - TA / TB'],
  ['MET]. T N273- Rotinas Administrativas - TAITR', 'Planej. e Org. Rotinas Administrativas - TA / TB'],
  ['MET]. T N273- Rotinas Administrativas - TAITO', 'Planej. e Org. Rotinas Administrativas - TA / TB'],
  ['Lab. Med. intervenção', 'Lab. Med. Intervenção'],
  ['Topografia Apl. à Construção TA / T', 'Topografia Apl. à Construção - TA / TB'],
  ['Redes de Comunicação de Dados ITA / TB', 'Redes de Comunicação de Dados - TA / TB'],
  ['PRICES, Comandos e Controladores TA ma', 'Máquinas, Comandos e Controles - TA / TB'],
  ['UU, Comandos e Controladores TA ITR', 'Máquinas, Comandos e Controles - TA / TB'],
  ['Planej. e Desenv. TCC-TA-TB', 'Planej. e Desenv. TCC - TA / TB'],
  ['Planej. e Desenv. TCC - TA-TB', 'Planej. e Desenv. TCC - TA / TB'],
  ['Informação e Comunicação TATR', 'Sistemas de Tec. Informação e Comunicação TA / TB'],
  ['informação & Comunicação', 'Sistemas de Tec. Informação e Comunicação TA / TB'],
  ['prediais TA / TB', 'Instalações Prediais - TA / TB'],
  ['Luger um . Prog. Microcontroladores TAITR', 'Linguagem de Prog. Microcontroladores - TA / TB'],
  ['Luger ur Prog. Microcontroladores TAITO', 'Linguagem de Prog. Microcontroladores - TA / TB'],
];

module.exports = {
  id: '005_correcao_exata_ocr_manha',
  descricao: 'Correções exatas de OCR confirmadas para os horários da manhã',
  async up(conn) {
    await conn.query(`CREATE TABLE IF NOT EXISTS gabarito_correcoes_exatas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo ENUM('disciplina','professor') NOT NULL,
      texto_origem VARCHAR(255) NOT NULL,
      chave_origem VARCHAR(255) NOT NULL,
      texto_corrigido VARCHAR(150) NOT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_gabarito_correcao_origem (tipo, chave_origem),
      KEY idx_gabarito_correcao_ativo (tipo, ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    for (const [origem, corrigido] of correcoes) {
      await conn.query(`INSERT INTO gabarito_correcoes_exatas
        (tipo, texto_origem, chave_origem, texto_corrigido, ativo)
        VALUES ('disciplina', ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE texto_origem = VALUES(texto_origem), texto_corrigido = VALUES(texto_corrigido), ativo = 1`,
      [origem, chave(origem), corrigido]);
    }
  },
};
