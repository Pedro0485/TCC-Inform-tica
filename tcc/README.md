# TCC — Sistema Acadêmico

## Estrutura de pastas

```
tcc/
├── frontend/
│   ├── index.html                    # página de login (turma / professor)
│   ├── pages/
│   │   └── coordenador/              # páginas do painel do coordenador
│   │       ├── coordenador-home.html
│   │       ├── coordenador-horarios.html
│   │       ├── coordenador-calendario.html
│   │       ├── coordenador-salas.html
│   │       └── coordenador-configuracoes.html
│   ├── css/
│   │   ├── style.css                 # estilo da página de login
│   │   ├── coordenador.css           # estilo base do painel do coordenador
│   │   └── coordenador-salas.css     # estilo específico da página de salas
│   ├── js/
│   │   ├── script.js                 # lógica da página de login
│   │   ├── calendario.js
│   │   ├── coordenador-configuracoes.js
│   │   └── coordenador-salas.js
│   └── assets/
│       └── images/
│           └── logo.png
│
├── backend/
│   ├── server.js                     # ponto de entrada do Node/Express
│   ├── package.json
│   ├── .env / .env.example
│   ├── api/
│   │   ├── config/db.js              # conexão com MySQL
│   │   ├── controllers/
│   │   │   ├── professorController.js
│   │   │   └── turmaController.js
│   │   ├── middlewares/authMiddleware.js
│   │   ├── utils/jwt.js
│   │   └── routes/
│   │       ├── professorRoutes.js
│   │       ├── turmaRoutes.js
│   │       └── loginRoutes.js
│   ├── scripts/seedAdmin.js          # cria o usuário coordenador inicial
│   ├── python/
│   │   └── README.txt                # pasta reservada (vazia) — veja o que vai entrar aqui
│   └── uploads/                      # PDFs enviados temporariamente
│
└── docs/
    └── design/paleta-de-cores.jpeg   # referência de paleta de cores do design
```

## O que foi feito na reorganização

- O front-end estava com HTML/CSS/JS já bem separados na pasta `fronted/`, então
  ela virou a base de `frontend/` (login) e passou a apontar para `css/style.css`
  e `js/script.js`.
- As páginas do painel do coordenador (pasta `TCC-Inform-tica-main/`) tinham dois
  arquivos com CSS e/ou JS **dentro do próprio HTML**:
  - `coordenador-configuracoes.html` tinha um `<script>` inline → extraído para
    `js/coordenador-configuracoes.js`.
  - `coordenador-salas.html` tinha um `<style>` e um `<script>` inline (o maior
    arquivo do projeto) → extraídos para `css/coordenador-salas.css` e
    `js/coordenador-salas.js`.
- Como as páginas do coordenador foram movidas para `pages/coordenador/`, todos
  os caminhos relativos (`href`, `src`, ícone do site) foram corrigidos para
  `../../css/...`, `../../js/...` e `../../assets/images/...`.
- O `backend/` foi **substituído pela versão mais atual** que você mandou:
  agora tem rotas de turma (`turmaRoutes.js`/`turmaController.js`), rota de
  login separada (`loginRoutes.js`), middleware de autenticação (`authMiddleware.js`),
  geração de token (`utils/jwt.js`) e script de seed do admin (`scripts/seedAdmin.js`).
  A pasta `node_modules` não foi incluída — rode `npm install` dentro de
  `backend/` pra recriá-la.
- A pasta `backend/python/` está **vazia por enquanto**, só com um
  `README.txt` explicando quais arquivos vão entrar ali (`read_pdf.py` e
  `requirements.txt`) quando você for implementar a leitura de PDF.

## Como rodar

**Backend**
```bash
cd backend
npm install
cp .env.example .env   # preencha com os dados do seu MySQL
npm run seed:admin     # cria o usuário coordenador inicial (admin)
npm run dev
```

**Python (só quando for implementar a leitura de PDF)**
Pasta `backend/python/` ainda está vazia — veja `backend/python/README.txt`
pra saber quais arquivos vão entrar ali.

**Frontend**
Abra `frontend/index.html` no navegador (ou sirva a pasta `frontend/` com uma
extensão tipo Live Server).
