"""Constantes e limites. Valores aqui foram calibrados com os PDFs reais
(prints de ~1130 px de largura; células ~210x55 px)."""
import os

# --- limites de segurança -------------------------------------------------
MAX_PAGINAS = int(os.getenv("HORARIOS_MAX_PAGINAS", "120"))
MAX_PIXELS_IMAGEM = int(os.getenv("HORARIOS_MAX_PIXELS", str(16_000_000)))
# Se a página tiver mais caracteres que isso, ela tem texto selecionável
# (formato diferente do suportado) e é tratada como tal.
MIN_CHARS_PAGINA_COM_TEXTO = 60

# --- geometria da grade ---------------------------------------------------
MARGEM_BORDA_PX = 6            # linhas escuras na borda do print juntavam tudo
LIMIAR_FUNDO = 246             # pixel com min(canal) < isso não é fundo branco
CELULA_LARGURA = (120, 260)    # (min, max) em px
CELULA_ALTURA = (30, 90)
ALTURA_RODAPE = 14             # faixa com o nome dos professores
LOCK_LARGURA, LOCK_ALTURA = 26, 22   # ícone de cadeado no canto sup. direito

DIAS_ORDEM = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado"]
DIAS_ROTULO = {
    "segunda": "segunda-feira", "terca": "terca-feira", "quarta": "quarta-feira",
    "quinta": "quinta-feira", "sexta": "sexta-feira", "sabado": "sabado",
}

# --- OCR --------------------------------------------------------------------
IDIOMA_OCR = os.getenv("HORARIOS_OCR_LANG", "por")
THREADS_OCR = int(os.getenv("HORARIOS_OCR_THREADS", str(min(4, os.cpu_count() or 1))))

# --- confiança / consenso --------------------------------------------------
CONF_MINIMA_CORPO = 0.60       # abaixo disso a disciplina vai para revisão
# nomes: mescla variante rara em variante frequente (ruído de OCR)
SIM_MESCLA_NOME = 0.86
MIN_OCORR_CABECA_NOME = 3
RAZAO_CABECA_VARIANTE = 2.0
SIM_AVISO_NOME_PARECIDO = 0.80
# disciplinas: mesmo critério, mais conservador
SIM_MESCLA_DISCIPLINA = 0.92

# --- horários ---------------------------------------------------------------
DURACAO_AULA_MIN = (40, 60)    # duração plausível de um período (min)
# pares de dígitos que o OCR confunde nos rótulos minúsculos de horário
CONFUSOES_DIGITOS = {frozenset(p) for p in (
    ("1", "4"), ("1", "7"), ("9", "3"), ("9", "8"), ("0", "8"),
    ("0", "6"), ("5", "6"), ("3", "8"), ("2", "7"), ("0", "9"), ("1", "2"),
)}
MIN_APOIO_GRADE = 0.6          # fração de páginas que precisa concordar
