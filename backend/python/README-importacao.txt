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

Lista oficial de professores
----------------------------
Edite python/professores.txt (um nome por linha, grafia correta). Ao ler o PDF, cada nome lido que for
parecido com um da lista é trocado pelo nome oficial (evita professores duplicados por erro de OCR).
Nomes duvidosos/ambíguos não são trocados. Outro local de arquivo: HORARIOS_PROFESSORES no .env.

Lista oficial de matérias
-------------------------
Edite python/materias.txt (um nome por linha, SEM o marcador TA/TB). Ao ler o PDF, a matéria lida que for
parecida com uma da lista é trocada pelo nome oficial; o marcador de grupo (TA / TB) lido é mantido.
"Banco de Dados I" e "II" nunca são confundidos; nomes curtos só trocam se forem idênticos; na dúvida
nada é trocado. Células cortadas no próprio PDF continuam indo para a revisão. Outro local do arquivo:
HORARIOS_MATERIAS no .env.
