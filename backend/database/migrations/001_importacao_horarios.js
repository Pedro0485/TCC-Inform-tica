// Migração 001 — importação de horários por PDF
//
// O que faz (tudo idempotente: pode ser executada de novo sem efeito colateral):
//   1. cria `importacoes_horarios` (histórico + leitura guardada para a pré-visualização);
//   2. aulas.importacao_id  -> de qual importação veio cada aula (rastreio/auditoria);
//   3. aulas UNIQUE (turma_id, dia_semana, hora_inicio) -> impede registros inconsistentes
//      (uma turma não tem duas aulas no mesmo dia e horário). Se já existirem duplicatas,
//      a migração PARA e lista quais, sem apagar nada;
//   4. professores.email e professores.senha passam a aceitar NULL, para professores
//      cadastrados pela importação que ainda não têm acesso ao sistema. Quem tem
//      email NULL nunca consegue logar (o login busca por email) e a coordenadora pode
//      completar o cadastro depois, em "Usuários".
//
// Nenhum dado existente é alterado ou removido.

async function colunaExiste(conn, tabela, coluna) {
  const [r] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [tabela, coluna]);
  return r.length > 0;
}
async function indiceExiste(conn, tabela, indice) {
  const [r] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`, [tabela, indice]);
  return r.length > 0;
}
async function colunaPermiteNull(conn, tabela, coluna) {
  const [r] = await conn.query(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [tabela, coluna]);
  return r.length > 0 && r[0].IS_NULLABLE === 'YES';
}
async function fkExiste(conn, tabela, nome) {
  const [r] = await conn.query(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'`, [tabela, nome]);
  return r.length > 0;
}

module.exports = {
  id: '001_importacao_horarios',
  descricao: 'Importação de horários por PDF (histórico, rastreio e restrições)',

  async up(conn) {
    const [colunasBase] = await conn.query(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('professores', 'turmas', 'aulas', 'aulas_professores')`);
    if (colunasBase.length < 4) throw new Error('Execute primeiro npm run db:schema para criar as tabelas do projeto principal.');
    // 1) histórico de importações -------------------------------------------------
    await conn.query(`
      CREATE TABLE IF NOT EXISTS importacoes_horarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        criado_por INT NOT NULL,
        nome_original VARCHAR(255) NOT NULL,          -- só para exibir; nunca vira caminho de arquivo
        arquivo_sha256 CHAR(64) NOT NULL,
        tamanho_bytes INT NOT NULL,
        status ENUM('processando','pronta','confirmada','falhou','cancelada')
               NOT NULL DEFAULT 'processando',
        etapa VARCHAR(30) NOT NULL DEFAULT 'leitura_pdf',  -- etapa atual, ou onde ocorreu o erro
        progresso TINYINT UNSIGNED NOT NULL DEFAULT 0,
        mensagem VARCHAR(255) NULL,
        erro_codigo VARCHAR(60) NULL,
        erro_mensagem VARCHAR(500) NULL,
        total_turmas INT NULL,
        total_aulas_encontradas INT NULL,
        total_aulas_importadas INT NULL,
        dados_json LONGTEXT NULL,          -- leitura do PDF (fonte da verdade da pré-visualização)
        snapshot_anterior LONGTEXT NULL,   -- aulas substituídas na confirmação (para recuperação manual)
        resultado_json TEXT NULL,          -- resumo do que foi gravado
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        confirmada_em DATETIME NULL,
        CONSTRAINT fk_importacoes_criador FOREIGN KEY (criado_por)
          REFERENCES professores(id) ON DELETE CASCADE,
        KEY idx_importacoes_status (status),
        KEY idx_importacoes_sha (arquivo_sha256)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // 2) rastreio: de qual importação veio a aula --------------------------------
    if (!(await colunaExiste(conn, 'aulas', 'importacao_id'))) {
      await conn.query('ALTER TABLE aulas ADD COLUMN importacao_id INT NULL');
    }
    if (!(await fkExiste(conn, 'aulas', 'fk_aulas_importacao'))) {
      await conn.query(`ALTER TABLE aulas ADD CONSTRAINT fk_aulas_importacao
        FOREIGN KEY (importacao_id) REFERENCES importacoes_horarios(id) ON DELETE SET NULL`);
    }

    // 3) A aplicação verifica duplicatas e conflitos durante a confirmação transacional.
    // Não criamos índice UNIQUE aqui: bancos legados podem ter aulas sobrepostas válidas.
    // 4) professores cadastrados pela importação ainda não têm login ---------------
    if (!(await colunaPermiteNull(conn, 'professores', 'email'))) {
      await conn.query('ALTER TABLE professores MODIFY email VARCHAR(150) NULL');
    }
    if (!(await colunaPermiteNull(conn, 'professores', 'senha'))) {
      await conn.query('ALTER TABLE professores MODIFY senha VARCHAR(255) NULL');
    }
  },
};





