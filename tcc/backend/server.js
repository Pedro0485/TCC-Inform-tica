require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./api/config/db');
const professorRouter = require('./api/routes/professorRoutes');
const turmaRouter = require('./api/routes/turmaRoutes');
const loginRouter = require('./api/routes/loginRoutes');
const notificacaoRouter = require('./api/routes/notificacaoRoutes');

const app = express();

app.use(cors());
app.use(express.json());

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
app.use('/login', loginRouter);
app.use('/notificacoes', notificacaoRouter);

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
// ser adicionada ao schema.sql não a têm, e isso causava erro ao atribuir professores)
async function garantirTabelas() {
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
}

const PORT = process.env.PORT || 3000;
garantirTabelas().finally(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
});