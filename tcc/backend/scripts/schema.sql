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
  codigo VARCHAR(20) NOT NULL,      -- código numérico que o aluno digita no login
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
