# Gabarito lido visualmente nos PDFs reais (usado em testes de regressão do OCR).
# Cada linha da grade: 5 colunas (seg..sex). None = vazio/bloqueado.
GOLD = {
 ("NOITE", 1): [  # 1º Administração - Bariri
   [None]*5,
   ["Cálculos Financeiros e Estatístico","P. Org. Dep Pess TA / Apl Inf TB","Ações Estratégicas de Marketing","P. Org. Dep Pess Tb / Pl.e Org. Rot. Adm TA","Planejamento Empresarial"],
   ["Cálculos Financeiros e Estatístico","P. Org. Dep Pess TA / Apl Inf TB","Ações Estratégicas de Marketing","P. Org. Dep Pess Tb / Pl.e Org. Rot. Adm TA","Planejamento Empresarial"],
   ["Cálculos Financeiros e Estatístico","P. Org. Dep Pess TB / Apl Inf TA","Ética e Cidadania Organizacional","P. Org. Dep Pess TA / Pl.e Org. Rot. Adm TB","Economia e Mercado"],
   ["Cálculos Financeiros e Estatístico","P. Org. Dep Pess TB / Apl Inf TA","Ética e Cidadania Organizacional","P. Org. Dep Pess TA / Pl.e Org. Rot. Adm TB","Economia e Mercado"],
 ],
 ("PIMANH", 1): [  # 1º Mtec - PI - EDIFICAÇÕES
   ["Inglês","História","Instalações Prediais TA / TB","Física","Desenho Básico Apl. Edificações TA / TB"],
   ["Geografia","Artes","Estudos de Solos TA / TB","Ed. Física","Desenho Básico Apl. Edificações TA / TB"],
   ["Geografia","Português","Estudos de Solos TA / TB","Instalações Prediais TA / TB","Matemática"],
   ["História","Artes","Ed. Física","Química","Matemática"],
   ["Química","Matemática","Física","Biologia","Projetos Tec. da Informação e Com. - TA / TB"],
   ["Inglês","Português","Filosofia","Biologia","Projetos Tec. da Informação e Com. - TA / TB"],
   [None]*5,
   ["Tec. Materiais de Construção TA / TB",None,"Estudos de Viabilidade TA / TB","Português",None],
   ["Tec. Materiais de Construção TA / TB",None,"Estudos de Viabilidade TA / TB","Sociologia",None],
 ],
}
