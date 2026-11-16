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

## Checklist antes de publicar

1. Use Node.js 18 ou mais recente. Na pasta `backend`, instale somente dependências de produção com `npm ci --omit=dev`.
2. Configure as variáveis do `backend/.env` no provedor: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL=true`, `JWT_SECRET` com pelo menos 32 caracteres e `PYTHON_INTERNAL_KEY` com pelo menos 32 caracteres. Nunca publique esse arquivo.
3. Confirme no painel da Aiven que o serviço está ativo e que a rede do provedor do site pode alcançar o host e a porta do MySQL. Se a Aiven exigir uma CA específica, configure `DB_SSL_CA` com o caminho do certificado. O backend valida certificados TLS.
4. Antes de iniciar o site, rode `npm run db:schema` e `npm run db:migrate` usando as credenciais do banco de produção. O servidor recusa a inicialização se o banco ou as migrações obrigatórias estiverem indisponíveis.
5. Para importação de PDF, instale as dependências de `python/requirements.txt`, o Tesseract com idioma português e configure `PYTHON_BIN` para o mesmo Python. Use `python3` em Linux e `python` no Windows.
6. Inicie com `npm start`. Valide `/db` e, autenticado como coordenadora, `/importacoes/ambiente`; este último confirma Python, bibliotecas e Tesseract.

O limite de tentativas de login usa memória local do processo. Se o site for executado com várias instâncias simultâneas, substitua esse armazenamento por um limite compartilhado (por exemplo, Redis) para manter o mesmo limite entre instâncias.
