Script Python de leitura do PDF de horários.

Arquivos:
- read_pdf.py       -> le o PDF salvo em backend/uploads/horarios/, extrai as
                        aulas (dia da semana, hora inicio, hora fim, materia)
                        e envia o resultado para o Node na rota interna
                        POST /turmas/horarios-lidos.
- requirements.txt  -> dependencias (instalar com "pip install -r requirements.txt").

Como é chamado:
O Node (backend/api/controllers/turmaController.js, funcao uploadHorarios)
chama este script via child_process logo depois que o multer termina de
salvar o PDF em uploads/horarios, passando:

    python3 read_pdf.py <caminho_do_pdf_salvo> <turma_id>

O script então lê o PDF, tenta extrair a grade de horários (primeiro como
tabela, depois por regex no texto puro como fallback) e ele mesmo faz o POST
para /turmas/horarios-lidos com o JSON das aulas encontradas, usando a chave
em PYTHON_INTERNAL_KEY (definida no .env) para autenticar nessa rota interna.

Configuração necessária no backend/.env:
- NODE_API_URL         (ex: http://localhost:3000)
- PYTHON_INTERNAL_KEY  (mesma string usada pelo Node pra validar a chamada)
- PYTHON_BIN           (python3, python, ou caminho de uma venv)

IMPORTANTE: a extração em read_pdf.py é "melhor esforço" — as funções
extrair_aulas_da_tabela e extrair_aulas_do_texto podem precisar de ajuste
fino para bater exatamente com o layout do PDF real usado pela escola.
