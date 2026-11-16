"""Leitura de PDFs de horários (grade semanal por turma).

Os PDFs deste projeto são *prints de tela* colados no Word: cada página é uma
imagem raster (sem texto selecionável) com a grade de uma turma. Por isso o
módulo usa visão computacional (OpenCV) para achar as células da grade e OCR
(Tesseract) para ler cada uma, e depois reconcilia o resultado com a estrutura
do documento (grade de horários e vocabulário de professores).

Etapas (cada uma em seu módulo):
    extracao       -> PDF -> imagens por página -> grade de células
    ocr            -> leitura de texto de cada região
    normalizacao   -> limpeza de texto, nomes e título da turma
    interpretacao  -> célula bruta -> aula estruturada
    consenso       -> correção conservadora por votação entre ocorrências
    validacao      -> regras de consistência e alertas
    pipeline       -> orquestra tudo e devolve o JSON padronizado
"""
VERSAO_ESQUEMA = 1
