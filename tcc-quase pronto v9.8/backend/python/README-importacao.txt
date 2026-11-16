Importação de horários por PDF

1. No backend, instale as dependências Node: npm install
2. Instale Tesseract OCR (com dados de idioma português) no sistema operacional.
3. Instale bibliotecas Python: python -m pip install -r python/requirements-importacao.txt
4. Configure .env com a mesma conexão MySQL usada pelo sistema e JWT_SECRET.
5. Execute: npm run db:migrate
6. Inicie o backend: npm start
7. Acesse a página da coordenação "Importar horários por PDF".

As aulas finais são registradas nas tabelas existentes aulas e aulas_professores.
O importador mantém as aulas já cadastradas, reutiliza registros idênticos e interrompe
em caso de colisão de matéria/horário. A migração recusa duplicatas existentes antes
de criar controles, não remove dados e pode ser reaplicada com segurança.
