# Importação de horários por PDF

Guia técnico da funcionalidade. Resumo para quem só quer usar: **README.md → "Importação de horários"**.

## 1. O que foi implementado

A coordenadora envia o PDF de horários em **Coordenador → Horários**; o sistema lê as grades, mostra uma
**pré-visualização para conferência** (com tudo que está duvidoso destacado) e **só grava no banco depois que ela confirma**.
Também há consulta dos horários gravados (coordenadora: por turma/professor; aluno: da própria turma; professor: os seus)
e melhorias discretas de animação.

Fluxo, com a etapa onde cada tipo de erro é reportado:

| Etapa | O que acontece | Erro aparece como |
|---|---|---|
| `envio_arquivo` | tipo, tamanho e bytes do PDF são validados | "Envio do arquivo" |
| `leitura_pdf` | Python lê a grade (visão computacional + OCR) | "Leitura do PDF" |
| `comunicacao_servicos` | Node ↔ Python (subprocesso, JSON) | "Comunicação entre os serviços" |
| `validacao_dados` | Node valida a estrutura e as correções | "Validação dos dados" |
| `gravacao_banco` | transação única no banco | "Gravação no banco de dados" |

## 2. Como o PDF é processado (o que os PDFs reais têm de especial)

Os três PDFs de exemplo **não têm texto selecionável**: cada página é um *print de tela* (imagem de ~1130 px) colado no Word.
Por isso a extração de texto convencional (pdfplumber/Camelot) não serve e o OCR é necessário. Estrutura encontrada:

* **uma página = uma turma**; o título (`1º Administração - Bariri`) traz ano e nome; não há código de turma;
* 5 colunas (segunda a sexta) e linhas = períodos de 50 min; cada aula costuma ocupar **2 períodos seguidos idênticos**;
* cada cartão tem o nome da disciplina (corpo) e, numa faixa inferior, **o(s) professor(es)** — a associação é geométrica
  (mesmo cartão), nunca por proximidade de texto;
* células **hachuradas** = período bloqueado (almoço / 18:10); células **cinza-claras** = sem aula;
* `TA / TB` = turma dividida em grupos; os professores são listados sem dizer qual leciona para qual grupo;
* `SUBS_Inglês`, `SEM_PROF ADM` = marcadores do sistema de origem, **não** são pessoas (nunca viram professor);
* o PDF *NOITE* tem 21 páginas, *TARDE* 2, *PI MANHÃ* 12. Turnos: noturno, vespertino e integral.

Pipeline (`backend/python/horarios_pdf/`, uma responsabilidade por módulo):

| Módulo | Função |
|---|---|
| `extracao.py` | imagem nativa de cada página (só pdfplumber) → detecção das células (OpenCV) → classifica aula / bloqueado / vazio |
| `ocr.py` | Tesseract em português. Tons de cinza (preserva anti-aliasing: erro de ~6% caiu para <1%), ganho adaptativo ao fundo, votação entre variantes, detecção de rodapé de 2 linhas e de texto cortado |
| `normalizacao.py` | limpeza, nomes, título → (ano, nome), marcadores TA/TB, algarismos romanos |
| `interpretacao.py` | página → título, dias (confirmados pelo cabeçalho), horários, células; períodos idênticos lidos 1 vez |
| `consenso.py` | correção **conservadora** por votação entre ocorrências e reconciliação da grade de horários |
| `validacao.py` | obrigatórios, duplicidades, conflitos de professor, nomes parciais |
| `pipeline.py` | `ler_paginas` (lento, OCR) + `consolidar` (rápido, sem OCR) → JSON padronizado |

Decisões importantes (e por quê):

* **Nunca inventar**: o que não é confiável é marcado `requer_revisao` e a importação fica **bloqueada** até a coordenadora
  conferir, editar ou excluir cada item.
* **Correção por consenso só quando seguro.** O mesmo professor aparece dezenas de vezes e os erros de OCR variam, então a leitura
  frequente vence a rara. Mas só funde textos cuja *assinatura crítica* (números, romanos, TA/TB, em ordem) é igual:
  `Banco de Dados I` ≠ `II`, `TA/…/TB` ≠ `TB/…/TA`. Toda correção é listada na aba "Avisos e correções".
* **Sem autocorreção ortográfica por palavra**: os PDFs têm erros de digitação *reais* (`Adminstração`, `GEstão`, `Desenvolvimeto`);
  corrigir "para o mais frequente" alteraria o que o documento diz.
* **Horários**: o OCR dos rótulos minúsculos erra dígitos (`1→4`). O horário de cada linha é votado entre as páginas do arquivo;
  só se corrige quando a diferença é uma confusão conhecida de dígitos, ou por contexto (duração padrão + ordem + solução única).
  Linhas corrigidas por contexto/deduzidas exigem a conferência da tabela de horários da turma.
* **`TA / TB`**: a aula é mantida como **uma** aula com os dois professores (o PDF não diz quem leciona para qual grupo). Nada é adivinhado.
* O `TA /TB` final ilegível (`TAB`, `TA mB`…) é reparado **só** no padrão inequívoco (termina em `TA`+lixo e não há `TB` na célula),
  com aviso e o texto original guardado.
* Acentos: o modelo de português às vezes **acrescenta** acento a nomes que no PDF não têm (`Maurício` onde está `MAURICIO`).
  A comparação com o banco ignora acento/caixa/espaço, então não duplica; a grafia pode ser corrigida na aba Professores.

## 3. Como os dados vão do Python ao Node

* O Node chama `python/read_horarios_pdf.py <pdf>` com `spawn(..., { shell: false })` e **argumento em array**: o único argumento é
  o caminho que o próprio servidor gerou (UUID). O filho recebe um **ambiente mínimo** (não herda `DB_PASSWORD` nem `JWT_SECRET`).
* O Python escreve **um JSON** no `stdout` (`{"ok":true,"dados":{…}}` ou `{"ok":false,"erro":{etapa,codigo,mensagem}}`) e linhas
  `@@PROGRESSO {json}` no `stderr` (a tela mostra o andamento). Os logs **não contêm texto do documento**.
* Não há API HTTP interna do Python: **nada novo fica exposto** (a rota legada `/turmas/horarios-lidos` não é usada).
* O Node valida a estrutura (`validarSaidaPython`), confere o SHA-256 do arquivo e guarda a leitura em `importacoes_horarios.dados_json`.
* **A confirmação não reenvia dados.** O cliente manda só as *correções* (patch: aulas editadas/excluídas/conferidas, nomes de professores,
  turma de destino). O servidor reaplica sobre a leitura que ele mesmo guardou e revalida. Assim o cliente **não consegue injetar aulas
  que não vieram do PDF**.

## 4. Banco de dados

Reaproveitado: `turmas`, `professores`, `aulas`, `aulas_professores` (N:N). **Nada foi removido ou alterado nos dados.**

Migração `001_importacao_horarios` (`npm run db:migrate`, idempotente, aplicada e reaplicada nos testes):

| Mudança | Para quê |
|---|---|
| tabela `importacoes_horarios` | histórico, andamento, erro por etapa, leitura guardada, **snapshot das aulas substituídas** |
| `aulas.importacao_id` (FK, `ON DELETE SET NULL`) | rastrear de qual importação veio cada aula |
| `UNIQUE (turma_id, dia_semana, hora_inicio)` em `aulas` | o banco recusa registros inconsistentes. Se já houver duplicatas a migração **para sem apagar nada** e lista quais |
| `professores.email` e `.senha` aceitam `NULL` | professor criado pela importação ainda **não tem acesso**; nunca consegue logar (o login busca por e-mail); a coordenadora completa em *Usuários* |

Gravação (`repositorio.js → gravar`): **uma transação**; trava a linha da importação (`FOR UPDATE`) → cria só professores/turmas que faltam
(comparação sem acento/caixa/espaço) → guarda snapshot → substitui **apenas as turmas do PDF** → insere aulas e vínculos → marca `confirmada`.
Qualquer falha dá `ROLLBACK` e a importação continua "pronta" para nova tentativa. As aulas antigas **não são apagadas antes** de tudo estar validado.
Turmas criadas automaticamente ganham um **código de acesso aleatório de 6 dígitos**, exibido ao final (o PDF não traz código).

## 5. Segurança

* Só coordenadora (JWT **e** reconfirmação do `admin` no banco a cada chamada: token antigo de quem foi rebaixada não vale).
* PDF: extensão **e** assinatura `%PDF-` conferidas; limite de tamanho (413); nome interno UUID; pasta privada (fora do `express.static`);
  **apagado logo após a leitura**, mesmo em caso de erro; sobras >1 h são limpas na subida do servidor; o PDF nunca é executado.
* Limites: páginas (120), pixels por imagem, tempo (30 min), tamanho da saída do Python, 1 leitura simultânea.
* Texto vindo do PDF é **dado não confiável**: o servidor recusa `< > ` e caracteres de controle em disciplina/turma e restringe nomes de
  professores a letras/espaço/`.`/`'`/`-`; a tela monta tudo com `textContent`.
* Mensagens de erro e logs não expõem conteúdo do documento nem SQL.

## 6. Arquivos

Criados — Python: `backend/python/horarios_pdf/*`, `read_horarios_pdf.py`, `tessdata/por.traineddata`, `tests/*`.
Node: `api/config/importacaoConfig.js`, `api/services/importacaoHorarios/*`, `api/controllers/{importacao,horario}Controller.js`,
`api/routes/{importacao,horario}Routes.js`, `api/middlewares/importacaoAuth.js`, `database/migrations/001_*.js`, `scripts/migrate.js`,
`api/tests/*`, `storage/.gitignore`.
Frontend: `pages/coordenador/coordenador-horarios.html`, `pages/{aluno,professor}/*-horarios.html`, `js/coordenador/coordenador-horarios.js`,
`js/shared/horarios-consulta.js`, `css/coordenador/coordenador-horarios.css`, `css/shared/{animacoes,horarios-consulta}.css`.

Alterados: `server.js` (monta `/importacoes` **antes** do `express.json()` global, que limita a 100 KB, e `/horarios`; limpeza ao subir),
`login.css` (acréscimo no fim), menus das páginas (item "Horários"), `coordenador-usuarios.js/css` (e-mail `NULL` → "sem acesso" + escape),
`package.json`, `.env.example`, `requirements.txt`, `.gitignore`, README.
**Não alterados**: `read_pdf.py` e `POST /turmas/upload-horarios` (fluxo antigo, por turma, continuam como estavam; ver "Limitações").

## 7. Animações adicionadas

Só CSS, só `transform`/`opacity`; **todas** desligadas com `prefers-reduced-motion`; nenhum recurso depende de *hover*.

* **Login**: container entra com fade + subida de 28 px em **900 ms**; botões/campos reagem em **200 ms** (elevação 2 px, sombra, brilho, clique,
  foco com anel); botão desabilitado pulsa enquanto "Entrando…"; mensagens aparecem suavemente. O CSS antigo (450 ms nos botões) foi sobreposto.
* **Painel (todas as páginas)** — `css/shared/animacoes.css`: botões (elevação, sombra, luminosidade, clique, estado *carregando* com spinner,
  desabilitado), cards (elevação só com mouse), modais e popovers (fade + deslocamento), mensagens de erro/sucesso, campos, entrada do conteúdo.
* **Importação**: etapas (leitura → conferência → gravação), barra de progresso, área de arrastar PDF com feedback, modal de edição.

## 8. Testes executados (resultado real)

Ambiente: Python 3.12, Node 22, Tesseract 5, **MariaDB 10.11 real**, Chromium headless. 

| Suíte | Comando | Resultado |
|---|---|---|
| Python unitários (normalização, consenso, validação) | `npm run test:py` | 17/17 |
| Python CLI (PDFs corrompido, inexistente, vazio, só-texto, sem grade, páginas demais; **PDF real da tarde** com células conferidas) | idem | 15/15 |
| Node validador (estrutura, plano, bloqueios, XSS) | `npm test` | 22/22 |
| Node + banco real (gravação, **idempotência**, **2 confirmações simultâneas**, **rollback**, substituição com snapshot, professor existente, UNIQUE) | `npm test` | 11/11 |
| Node ponta a ponta (servidor + Python/OCR + banco: autenticação, token de admin desatualizado, arquivo falso/grande/corrompido, fluxo real com revisão obrigatória, repetição, consulta por perfil) | `npm test` | 5/5 |
| Interface no Chromium (animações medidas, reduced-motion, celular, fluxo real do PDF pelo painel, edição, gravação, consulta, XSS armazenado) | `npm run test:ui` | 33/33 |

**Exatidão do OCR** medida contra um gabarito lido visualmente (página 1 de NOITE e de MANHÃ: 56 células com disciplina **e** professores):
**53/56 (94,6%) exatas e 0 erros sem sinalização** (as 3 falhas ficam marcadas para revisão). Os nomes de professores: 56/56.
(O gabarito está em `python/tests/gold_*.py`; reavalie com `python/tests/avaliar_gabarito.py`.)

Carga de revisão com os PDFs reais (aulas que a coordenadora precisa conferir): NOITE 50 de 434 (12%), MANHÃ 27 de 427 (6%), TARDE 6 de 60 (10%).
Contagens batem com a estrutura: ex. NOITE 90 períodos bloqueados = 18 turmas × 5 dias (as outras 3 têm aula na 1ª linha).

## 9. Limitações

* **Cobertura do gabarito**: a exatidão foi medida em 2 páginas de 35. As demais passaram por conferência de contagens e de nomes, não célula a célula.
  Na MANHÃ (CLI inteira) o gabarito deu 33/36; a NOITE foi medida lendo as páginas em lotes (mesmo código, sem a CLI inteira, porque o ambiente
  de teste reiniciava durante execuções longas); a **CLI inteira** foi executada de ponta a ponta com os PDFs da tarde e da manhã.
* **Texto cortado no PDF de origem** (nomes longos que o sistema de origem corta) não é recuperável: vira item de revisão manual.
* **Acentos de nomes** podem ser acrescentados/omitidos pelo OCR; use a aba Professores.
* **Associação professor ↔ grupo (TA/TB)** não existe no PDF; os dois professores ficam na aula.
* **Velocidade**: ~10 s por página em 1 CPU (NOITE ≈ 4–5 min). Roda em segundo plano com progresso; mais CPUs aceleram (`HORARIOS_OCR_THREADS`).
* Só o **layout dos PDFs deste sistema de origem** é suportado. PDF com texto selecionável ou outro leiaute devolve erro claro (`GRADE_NAO_ENCONTRADA`).
* Páginas com erro de leitura (`HORARIO_ILEGIVEL`) bloqueiam a turma; é preciso ignorá-la (não há como inserir a linha que faltou pela tela).
* A confirmação **substitui** as aulas das turmas do PDF. O snapshot do que foi substituído fica em `importacoes_horarios.snapshot_anterior`,
  mas **não há botão de desfazer** (a recuperação é manual).
* O fluxo antigo (`read_pdf.py` + `/turmas/upload-horarios`, 1 turma por PDF, sem professor) continua existindo, mas **não consegue ler estes PDFs**
  e a rota interna `/turmas/horarios-lidos` insere sem validar/deduplicar; sugerimos desativá-los.
* `admin` continua embutido no JWT para o resto da API (só a importação reconfirma no banco).
* Os testes de interface substituem os CDNs (SweetAlert2, ícones) por *stubs*; o visual real dos ícones não foi verificado.
