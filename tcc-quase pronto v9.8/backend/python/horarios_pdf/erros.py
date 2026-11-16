"""Erros do módulo, sempre com a ETAPA em que ocorreram.

O Node usa `etapa` para dizer à coordenadora se o problema foi na leitura do
PDF, na validação etc. As mensagens NUNCA incluem conteúdo do documento.
"""


class ErroHorarios(Exception):
    etapa = "leitura_pdf"
    codigo = "ERRO_GENERICO"

    def __init__(self, mensagem, codigo=None):
        super().__init__(mensagem)
        self.mensagem = mensagem
        if codigo:
            self.codigo = codigo

    def como_dict(self):
        return {"etapa": self.etapa, "codigo": self.codigo, "mensagem": self.mensagem}


class ErroLeituraPDF(ErroHorarios):
    """PDF inválido, corrompido, grande demais ou sem nenhuma grade reconhecível."""
    etapa = "leitura_pdf"
    codigo = "PDF_ILEGIVEL"


class ErroOCR(ErroHorarios):
    """Tesseract ausente/sem idioma português ou falha ao reconhecer texto."""
    etapa = "leitura_pdf"
    codigo = "OCR_INDISPONIVEL"


class ErroValidacao(ErroHorarios):
    etapa = "validacao"
    codigo = "DADOS_INVALIDOS"
