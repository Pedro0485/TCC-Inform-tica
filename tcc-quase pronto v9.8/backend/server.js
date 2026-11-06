require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./api/config/db');
const professorRouter = require('./api/routes/professorRoutes');
const turmaRouter = require('./api/routes/turmaRoutes');
const loginRouter = require('./api/routes/loginRoutes');
const notificacaoRouter = require('./api/routes/notificacaoRoutes');
const eventoRouter = require('./api/routes/eventoRoutes');
const importacaoRouter = require('./api/routes/importacaoRoutes');
const horarioRouter = require('./api/routes/horarioRoutes');
const importacaoService = require('./api/services/importacaoHorarios/importacaoService');
const administracaoDadosRouter = require('./api/routes/administracaoDadosRoutes');
const auditoriaAtividade = require('./api/services/auditoriaAtividade');

const app = express();

app.use(cors());
// Importação aceita payloads de correção maiores que o limite padrão do Express.
app.use('/importacoes', importacaoRouter);
app.use(express.json());
app.use(auditoriaAtividade.middleware);

// Serve o frontend estático — tenta detectar automaticamente onde está o index.html
const candidatos = [
  path.join(__dirname, 'frontend'),
  path.join(__dirname, 'frontend', 'frontend'),
  path.join(__dirname, 'fronted'),
  path.join(__dirname, 'fronted', 'fronted'),
  path.join(__dirname, '..', 'frontend'),
  path.join(__dirname, '..', 'fronted')
];

let FRONTEND_PATH = null;
for (const candidato of candidatos) {
  if (fs.existsSync(path.join(candidato, 'index.html'))) {
    FRONTEND_PATH = candidato;
    break;
  }
}

if (FRONTEND_PATH) {
  console.log(`[frontend] OK, servindo a partir de: ${FRONTEND_PATH}`);
  app.use(express.static(FRONTEND_PATH));
} else {
  console.log('[frontend] AVISO: não encontrei index.html em nenhum destes caminhos:');
  candidatos.forEach((c) => console.log('  - ' + path.join(c, 'index.html')));
  console.log('[frontend] Rode "dir /s /b index.html" na pasta backend para achar o caminho certo e me avise.');
}

app.get('/db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ db: 'ok', result: rows[0] });
  } catch (err) {
    res.status(500).json({ db: 'erro', detail: err.message });
  }
});

app.use('/professor', professorRouter);
app.use('/turmas', turmaRouter);
app.use('/admin/dados', administracaoDadosRouter);
app.use('/login', loginRouter);
app.use('/notificacoes', notificacaoRouter);
app.use('/eventos', eventoRouter);
app.use('/horarios', horarioRouter);

// Tratamento de erros do multer (arquivo inválido, tamanho excedido, etc.)
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Erro ao processar arquivo' });
  }
  next();
});

// Garante que a tabela de professores por matéria exista (bancos criados antes dela
// ser adicionada ao esquema não a têm, e isso causava erro ao atribuir professores)
async function garantirTabelas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auditoria_atividade (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NULL,
        usuario_nome VARCHAR(150) NOT NULL,
        acao VARCHAR(60) NOT NULL,
        entidade VARCHAR(80) NOT NULL,
        detalhes VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_auditoria_atividade_data (created_at),
        INDEX idx_auditoria_atividade_entidade (entidade)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[db] auditoria de alterações recentes OK');
  } catch (err) {
    console.error('[db] não foi possível criar/verificar auditoria_atividade:', err.message);
  }


  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS materias_professores (
        materia VARCHAR(150) NOT NULL,
        professor_id INT NOT NULL,
        PRIMARY KEY (materia, professor_id),
        CONSTRAINT fk_materias_professores_professor
          FOREIGN KEY (professor_id) REFERENCES professores(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[db] tabela materias_professores OK');
  } catch (err) {
    console.error('[db] não foi possível criar/verificar materias_professores:', err.message);
  }

  // Notificações: garante tabelas de destinos/lidas e os valores de ENUM
  // (bancos criados antes dessas alterações não os têm; sem eles as turmas
  // ficavam sem destino válido e nunca recebiam as notificações)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notificacoes_destinos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        notificacao_id INT NOT NULL,
        destino_tipo ENUM('todos','professores','turmas','professor','turma') NOT NULL,
        destino_id INT NOT NULL DEFAULT 0,
        CONSTRAINT fk_notificacoes_destinos_notificacao
          FOREIGN KEY (notificacao_id) REFERENCES notificacoes(id) ON DELETE CASCADE,
        UNIQUE KEY uk_notificacao_destino (notificacao_id, destino_tipo, destino_id),
        INDEX idx_notificacoes_destinos_busca (destino_tipo, destino_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const enumDestino = "ENUM('todos','professores','turmas','professor','turma') NOT NULL";

    await pool.query(`ALTER TABLE notificacoes_destinos MODIFY destino_tipo ${enumDestino}`);
    await pool.query(`ALTER TABLE notificacoes MODIFY destino_tipo ${enumDestino}`);

    await pool.query(`
      INSERT INTO notificacoes_destinos (notificacao_id, destino_tipo, destino_id)
      SELECT n.id, n.destino_tipo, COALESCE(n.destino_id, 0)
      FROM notificacoes n
      WHERE n.destino_tipo <> ''
        AND NOT EXISTS (
          SELECT 1 FROM notificacoes_destinos d WHERE d.notificacao_id = n.id
        )
    `);
    console.log('[db] notificacoes_destinos OK');
  } catch (err) {
    console.error('[db] não foi possível verificar notificacoes_destinos:', err.message);
  }

  // Eventos do calendário (manuais ou gerados por notificações)
  try {
    await pool.query(`
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
        CONSTRAINT fk_eventos_notificacao
          FOREIGN KEY (notificacao_id) REFERENCES notificacoes(id) ON DELETE CASCADE,
        INDEX idx_eventos_data (data_evento),
        INDEX idx_eventos_criador (criado_por_tipo, criado_por_id),
        INDEX idx_eventos_notificacao (notificacao_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[db] tabela eventos OK');
  } catch (err) {
    console.error('[db] não foi possível criar/verificar eventos:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
garantirTabelas().then(() => importacaoService.aoIniciar()).finally(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
});
