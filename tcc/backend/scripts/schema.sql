-- Schema do banco de dados do sistema acadêmico (TCC)
-- Cria as tabelas usadas pelo login de professores/coordenador e de turmas,
-- além das tabelas de aulas usadas na leitura dos horários.
--
-- Uso:
--   mysql -u SEU_USUARIO -p SEU_BANCO < scripts/schema.sql
-- (ajuste usuário/banco conforme o que você colocou no .env)

-- ---------------------------------------------------------------
-- professores
-- Guarda tanto os professores comuns quanto a coordenadora
-- (coordenadora = registro com admin = 1, criado pelo scripts/seedAdmin.js)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS professores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  senha VARCHAR(255) NOT NULL,      -- hash bcrypt, nunca a senha em texto puro
  admin TINYINT(1) NOT NULL DEFAULT 0,  -- 1 = coordenadora, 0 = professor comum
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_professores_email (email),
  UNIQUE KEY uk_professores_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- turmas
-- Login do aluno é feito por nome + ano + código (sem senha individual)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS turmas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  ano TINYINT NOT NULL,             -- 1, 2 ou 3
  codigo VARCHAR(20) NOT NULL,      -- código (letras/números, funciona como senha) que o aluno digita no login
  turno ENUM('matutino', 'integral', 'vespertino', 'noturno') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_turmas_codigo (codigo),
  UNIQUE KEY uk_turmas_nome_ano (nome, ano)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- aulas
-- Cada linha é um horário de aula de uma turma (dia da semana + horário)
-- ---------------------------------------------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- aulas_professores
-- Tabela associativa: uma aula pode ter um ou mais professores
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aulas_professores (
  aula_id INT NOT NULL,
  professor_id INT NOT NULL,
  PRIMARY KEY (aula_id, professor_id),
  CONSTRAINT fk_aulas_professores_aula FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE CASCADE,
  CONSTRAINT fk_aulas_professores_professor FOREIGN KEY (professor_id) REFERENCES professores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- Notificações criadas pela coordenação
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notificacoes_lidas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notificacao_id INT NOT NULL,
  destinatario_tipo ENUM('professor','turma') NOT NULL,
  destinatario_id INT NOT NULL,
  lida_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_notificacao_leitura (notificacao_id, destinatario_tipo, destinatario_id),
  CONSTRAINT fk_notificacoes_lidas_notificacao FOREIGN KEY (notificacao_id) REFERENCES notificacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ---------------------------------------------------------------
-- notificacoes_destinos
-- Uma notificação pode ter VÁRIOS destinatários. Cada linha é um destino:
--   destino_tipo = 'todos' | 'professores' | 'turmas'  -> destino_id NULL
--   destino_tipo = 'professor' | 'turma'                -> destino_id = id do professor/turma
-- As colunas destino_tipo/destino_id da tabela notificacoes continuam
-- existindo e guardam apenas o PRIMEIRO destino (compatibilidade).
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificacoes_destinos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notificacao_id INT NOT NULL,
  destino_tipo ENUM('todos','professores','turmas','professor','turma') NOT NULL,
  destino_id INT NOT NULL DEFAULT 0,  -- 0 = destino geral (sem id); evita NULL na chave única
  CONSTRAINT fk_notificacoes_destinos_notificacao FOREIGN KEY (notificacao_id) REFERENCES notificacoes(id) ON DELETE CASCADE,
  UNIQUE KEY uk_notificacao_destino (notificacao_id, destino_tipo, destino_id),
  INDEX idx_notificacoes_destinos_busca (destino_tipo, destino_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backfill: notificações criadas antes desta tabela passam a ter 1 destino
-- (idempotente: só insere para quem ainda não tem nenhum destino cadastrado)
INSERT INTO notificacoes_destinos (notificacao_id, destino_tipo, destino_id)
SELECT n.id, n.destino_tipo, COALESCE(n.destino_id, 0)
FROM notificacoes n
WHERE NOT EXISTS (
  SELECT 1 FROM notificacoes_destinos d WHERE d.notificacao_id = n.id
);


-- ---------------------------------------------------------------
-- materias_professores
-- Professores responsáveis por cada matéria (a lista de matérias em si fica
-- no front, então a matéria é identificada pelo nome, igual a aulas.materia).
-- Uma matéria pode ter vários professores e um professor várias matérias.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materias_professores (
  materia VARCHAR(150) NOT NULL,
  professor_id INT NOT NULL,
  PRIMARY KEY (materia, professor_id),
  CONSTRAINT fk_materias_professores_professor FOREIGN KEY (professor_id) REFERENCES professores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
