Pasta reservada para o script Python de leitura de PDF.

Arquivos que vão entrar aqui quando essa parte for implementada:

- read_pdf.py        -> script único, responsável apenas por ler o texto de
                         um PDF recebido por caminho de arquivo e devolver o
                         texto extraído (via stdout) para o Node.js chamar
                         através de child_process.
- requirements.txt    -> lista das bibliotecas Python usadas (ex: pdfplumber
                         ou PyPDF2) para instalar com "pip install -r requirements.txt".
