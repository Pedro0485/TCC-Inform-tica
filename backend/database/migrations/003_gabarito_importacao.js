'use strict';

const fs = require('fs');
const path = require('path');

function chave(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function linhasArquivo(nome) {
  try {
    return fs.readFileSync(path.join(__dirname, '..', '..', 'python', nome), 'utf8')
      .replace(/^\uFEFF/, '').split(/\r?\n/).map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'));
  } catch (_) { return []; }
}

async function colunaExiste(conn, tabela, coluna) {
  const [rows] = await conn.query(`SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [tabela, coluna]);
  return rows.length > 0;
}

module.exports = {
  id: '003_gabarito_importacao',
  descricao: 'Gabarito oficial de professores e disciplinas para OCR',

  async up(conn) {
    await conn.query(`CREATE TABLE IF NOT EXISTS gabarito_entidades (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo ENUM('professor','disciplina') NOT NULL,
      nome_oficial VARCHAR(150) NOT NULL,
      chave_normalizada VARCHAR(255) NOT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      origem ENUM('carga_inicial','manual') NOT NULL DEFAULT 'manual',
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_gabarito_entidade_chave (tipo, chave_normalizada),
      KEY idx_gabarito_entidade_ativo (tipo, ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await conn.query(`CREATE TABLE IF NOT EXISTS gabarito_variacoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      entidade_id INT NOT NULL,
      tipo ENUM('professor','disciplina') NOT NULL,
      variacao VARCHAR(150) NOT NULL,
      chave_normalizada VARCHAR(255) NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_gabarito_variacao_chave (tipo, chave_normalizada),
      CONSTRAINT fk_gabarito_variacao_entidade FOREIGN KEY (entidade_id)
        REFERENCES gabarito_entidades(id) ON DELETE CASCADE,
      KEY idx_gabarito_variacao_entidade (entidade_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    if (!(await colunaExiste(conn, 'importacoes_horarios', 'gabarito_hash'))) {
      await conn.query('ALTER TABLE importacoes_horarios ADD COLUMN gabarito_hash CHAR(64) NULL');
    }
    if (!(await colunaExiste(conn, 'importacoes_horarios', 'gabarito_snapshot_json'))) {
      await conn.query('ALTER TABLE importacoes_horarios ADD COLUMN gabarito_snapshot_json LONGTEXT NULL');
    }

    // Carga inicial idempotente das listas oficiais que já acompanhavam o leitor de PDFs.
    // Variações OCR específicas podem ser mantidas pela tela de gabarito sem editar arquivos.
    for (const [tipo, arquivo] of [['professor', 'professores.txt'], ['disciplina', 'materias.txt']]) {
      for (const nome of linhasArquivo(arquivo)) {
        const key = chave(nome);
        if (!key) continue;
        await conn.query(`INSERT IGNORE INTO gabarito_entidades
          (tipo, nome_oficial, chave_normalizada, origem) VALUES (?, ?, ?, 'carga_inicial')`,
        [tipo, nome.slice(0, 150), key.slice(0, 255)]);
      }
    }
  },
};
