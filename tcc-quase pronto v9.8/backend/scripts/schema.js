'use strict';

// Definição das tabelas do sistema (professores, turmas, aulas, notificações, eventos...).
// É executada pelo comando `npm run db:schema` contra o banco configurado no .env.
// Todas as instruções são idempotentes (CREATE TABLE IF NOT EXISTS / INSERT ... WHERE NOT EXISTS),
// então é seguro rodar de novo.

module.exports = [
  `
    CREATE TABLE IF NOT EXISTS professores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      email VARCHAR(150) NOT NULL,
      senha VARCHAR(255) NOT NULL,      
      admin TINYINT(1) NOT NULL DEFAULT 0,  
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_professores_email (email),
      UNIQUE KEY uk_professores_nome (nome)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  `
    CREATE TABLE IF NOT EXISTS turmas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      ano TINYINT NOT NULL,             
      codigo VARCHAR(20) NOT NULL,      
      turno ENUM('matutino', 'integral', 'vespertino', 'noturno') NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_turmas_codigo (codigo),
      UNIQUE KEY uk_turmas_nome_ano (nome, ano)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  `
    CREATE TABLE IF NOT EXISTS aulas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      turma_id INT NOT NULL,
      dia_semana ENUM('segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado') NOT NULL,
      hora_inicio TIME NOT NULL,
      hora_fim TIME NOT NULL,
      materia VARCHAR(150) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_aulas_turma FOREIGN KEY (turma_id) REFERENCES turmas(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  `
    CREATE TABLE IF NOT EXISTS aulas_professores (
      aula_id INT NOT NULL,
      professor_id INT NOT NULL,
      PRIMARY KEY (aula_id, professor_id),
      CONSTRAINT fk_aulas_professores_aula FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE CASCADE,
      CONSTRAINT fk_aulas_professores_professor FOREIGN KEY (professor_id) REFERENCES professores(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  `
    CREATE TABLE IF NOT EXISTS notificacoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      titulo VARCHAR(150) NOT NULL,
      mensagem TEXT NOT NULL,
      tipo VARCHAR(30) NOT NULL DEFAULT 'info',
      destino_tipo ENUM('todos','professores','turmas','professor','turma') NOT NULL,
      destino_id INT NULL,
      criado_por INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_notificacoes_criador FOREIGN KEY (criado_por) REFERENCES professores(id) ON DELETE CASCADE,
      INDEX idx_notificacoes_destino (destino_tipo, destino_id),
      INDEX idx_notificacoes_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  `
    CREATE TABLE IF NOT EXISTS notificacoes_lidas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      notificacao_id INT NOT NULL,
      destinatario_tipo ENUM('professor','turma') NOT NULL,
      destinatario_id INT NOT NULL,
      lida_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_notificacao_leitura (notificacao_id, destinatario_tipo, destinatario_id),
      CONSTRAINT fk_notificacoes_lidas_notificacao FOREIGN KEY (notificacao_id) REFERENCES notificacoes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  `
    CREATE TABLE IF NOT EXISTS notificacoes_destinos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      notificacao_id INT NOT NULL,
      destino_tipo ENUM('todos','professores','turmas','professor','turma') NOT NULL,
      destino_id INT NOT NULL DEFAULT 0,  
      CONSTRAINT fk_notificacoes_destinos_notificacao FOREIGN KEY (notificacao_id) REFERENCES notificacoes(id) ON DELETE CASCADE,
      UNIQUE KEY uk_notificacao_destino (notificacao_id, destino_tipo, destino_id),
      INDEX idx_notificacoes_destinos_busca (destino_tipo, destino_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  `
    INSERT INTO notificacoes_destinos (notificacao_id, destino_tipo, destino_id)
        SELECT n.id, n.destino_tipo, COALESCE(n.destino_id, 0)
        FROM notificacoes n
        WHERE NOT EXISTS (
      SELECT 1 FROM notificacoes_destinos d WHERE d.notificacao_id = n.id
        )
  `,
  `
    CREATE TABLE IF NOT EXISTS materias_professores (
      materia VARCHAR(150) NOT NULL,
      professor_id INT NOT NULL,
      PRIMARY KEY (materia, professor_id),
      CONSTRAINT fk_materias_professores_professor FOREIGN KEY (professor_id) REFERENCES professores(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  `
    CREATE TABLE IF NOT EXISTS eventos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      titulo VARCHAR(150) NOT NULL,
      descricao TEXT NULL,
      data_evento DATE NOT NULL,
      hora_evento TIME NULL,
      notificacao_id INT NULL,
      criado_por_tipo ENUM('professor','turma') NOT NULL,
      criado_por_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_eventos_notificacao FOREIGN KEY (notificacao_id) REFERENCES notificacoes(id) ON DELETE CASCADE,
      INDEX idx_eventos_data (data_evento),
      INDEX idx_eventos_criador (criado_por_tipo, criado_por_id),
      INDEX idx_eventos_notificacao (notificacao_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
];
