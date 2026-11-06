# TCC — Sistema Acadêmico

Plataforma web para gestão de horários escolares: a coordenação cadastra turmas, professores, salas e
horários (inclusive por **importação de PDF com OCR**), envia notificações e mantém um calendário de
eventos; professores e alunos consultam o que é relevante para eles.

## Tecnologias

| Camada | Stack |
|---|---|
| Frontend | HTML, CSS e JavaScript puro (PWA com service worker) |
| Backend | Node.js, Express 5, JWT, bcrypt, multer |
| Banco de dados | MySQL 8 na nuvem ([Aiven](https://aiven.io)) via `mysql2` com SSL |
| Leitura de PDF | Python (OpenCV, pdfplumber, Tesseract OCR) |

## Estrutura

```
tcc/
├── backend/
│   ├── server.js                 # ponto de entrada (Express + serve o frontend)
│   ├── .env.example              # modelo de configuração (copie para .env)
│   ├── api/
│   │   ├── config/               # db.js (pool) e dbConfig.js (conexão/SSL a partir do .env)
│   │   ├── controllers/  routes/  middlewares/  utils/
│   │   ├── services/importacaoHorarios/   # pipeline de importação de PDF
│   │   └── tests/
│   ├── database/migrations/      # migrações incrementais (npm run db:migrate)
│   ├── scripts/                  # schema.js, createSchema.js, migrate.js, seedAdmin.js
│   ├── python/                   # leitura/OCR do PDF de horários
│   └── docs/cliente.http         # requisições de exemplo (extensão REST Client)
├── frontend/                     # login, painéis de coordenador, professor e aluno
└── docs/                         # paleta de cores e guia técnico da importação
```

## Como rodar

**1. Dependências**
```bash
cd backend
npm install
```

**2. Configuração** — o arquivo `backend/.env` guarda as credenciais do banco na Aiven e **nunca é
versionado**. Para outro computador, use o modelo:
```bash
cp .env.example .env     # preencha DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME e JWT_SECRET
```
Os dados do banco estão no painel da Aiven em *Overview → Connection information*.

**3. Banco de dados (uma única vez)**
```bash
npm run db:schema        # cria as tabelas no banco da nuvem
npm run db:migrate       # aplica as migrações (histórico de importações etc.)
npm run seed:admin -- "Nome da Coordenadora" "email@exemplo.com" "senha-forte"
```

**4. Iniciar**
```bash
npm run dev              # desenvolvimento (nodemon)   |   npm start  # produção
```
Acesse `http://localhost:3000`. O backend já serve a pasta `frontend/`.
Para verificar a conexão com o banco: `http://localhost:3000/db`.

**5. Importação de PDF (opcional)** — requer Python 3.11+ e Tesseract OCR:
```bash
python -m pip install -r python/requirements.txt
```
Detalhes em [`docs/importacao-horarios.md`](docs/importacao-horarios.md).

## Segurança

- `backend/.env` está no `.gitignore`; compartilhe apenas o `.env.example`.
- Senhas de usuários são armazenadas com hash bcrypt; as rotas de gestão exigem JWT de coordenadora.
- Para validar o certificado do servidor MySQL, baixe o *CA certificate* na Aiven, salve em
  `backend/certs/ca.pem` e ative `DB_SSL_CA=certs/ca.pem` no `.env`.
