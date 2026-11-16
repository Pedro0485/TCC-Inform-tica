"""Normalização de texto, nomes de professores e títulos de turma."""
import re
import unicodedata

_PARTICULAS = {"de", "da", "do", "dos", "das", "e"}
# Marcadores do sistema de origem que NÃO são pessoas (ex.: "SUBS_Inglês",
# "SEM_PROF ADM"). Nunca viram professor no banco.
_RE_PLACEHOLDER = re.compile(r"(^|\b)(SUBS|SEM[_ ]?PROF)\b|_", re.I)


def sem_acentos(texto):
    d = unicodedata.normalize("NFD", texto)
    return "".join(c for c in d if unicodedata.category(c) != "Mn")


def limpar_espacos(texto):
    return re.sub(r"\s+", " ", (texto or "").replace("\u00a0", " ")).strip()


def limpar_ruido_borda(texto):
    """Tira aspas/barras/pontuação solta que o OCR cria nas bordas do recorte."""
    t = limpar_espacos(texto)
    t = re.sub(r"^[\W_]+(?=[\wÀ-ú])", "", t)         # lixo antes da 1ª letra
    t = re.sub(r"(?<=[\wÀ-ú.])[\s|:;,\-_'\"“”‘’]+$", "", t)
    return t.strip()


def chave_nome(nome):
    """Chave de comparação: sem acento, maiúscula, só letras e espaço."""
    t = sem_acentos(nome).upper()
    t = re.sub(r"[^A-Z ]", " ", t)
    return limpar_espacos(t)


def eh_placeholder(nome):
    return bool(_RE_PLACEHOLDER.search(nome or ""))


def formatar_nome(nome):
    """JANAINA FRASSON -> Janaina Frasson (mantém acentos que o PDF mostra)."""
    partes = []
    for i, p in enumerate(limpar_espacos(nome).split(" ")):
        low = p.lower()
        partes.append(low if (i > 0 and low in _PARTICULAS) else low[:1].upper() + low[1:])
    return " ".join(partes)


def separar_professores(texto_rodape):
    """'A , B' -> ['A', 'B']. Descarta pedaços vazios/curtos demais."""
    brutos = re.split(r"\s*,\s*", limpar_espacos(texto_rodape))
    saida = []
    for b in brutos:
        b = re.sub(r"[^A-Za-zÀ-ú_ .'-]", "", b)
        b = limpar_ruido_borda(b)
        if len(chave_nome(b)) >= 3 or eh_placeholder(b):
            saida.append(b)
    return saida


def normalizar_materia(texto):
    t = limpar_ruido_borda(texto)
    t = re.sub(r"(?<=\s)\|(?=\s|$)", "I", t)           # 'Mobile | TA' -> 'Mobile I TA'
    # algarismos romanos lidos como L minúsculo ou barra: "ll"/"Il" -> "II", "lll" -> "III"
    t = re.sub(r"(?<=\s)[Il|]{2,3}(?=\s|$)", lambda m: "I" * len(m.group(0)), t)
    t = re.sub(r"\b(T[ABab])\s*[!|](?=\s|$)", r"\1 /", t)   # 'TB! Pl.e' -> 'TB / Pl.e'
    t = re.sub(r"\s*/\s*", " / ", t)          # 'TA/ TB' -> 'TA / TB'
    t = re.sub(r"\s+-\s+", " - ", t)
    t = re.sub(r"\b(T)([ab])\b", lambda m: "T" + m.group(2).upper(), t)  # Ta -> TA
    # O OCR lê a barra do marcador de grupo como I, l, |, ! ou 1 ("TAITB").
    t = re.sub(r"\bT([AB])\s*[Il|!1/]?\s*T([AB])\b", r"T\1 / T\2", t)
    return limpar_espacos(t)


def marcador_grupo_suspeito(materia):
    """True se sobrou algo parecido com TA/TB mas malformado (ex.: 'TAB', 'TAI')."""
    for tok in re.findall(r"\bT[AB][A-Za-z|!1]{0,3}\b", materia):
        if tok not in ("TA", "TB") and tok.upper() not in ("TABELA", "TABELAS"):
            return True
    if re.search(r"\bT[AB]\s*(?:ii|i:|:)\W*$", materia):
        return True
    # um marcador seguido de 1-3 caracteres soltos no fim ("TA mB"): o "/TB" foi mal lido
    return bool(re.search(r"\bT[AB]\s+(?!T[AB]\b)[^\s/]{1,3}$", materia))


def grupos_da_materia(materia):
    """Marcadores de grupo de laboratório (TA / TB) presentes no texto."""
    achados = sorted({m.upper() for m in re.findall(r"\bT([AB])\b", materia, flags=re.I)})
    return ["T" + a for a in achados]


def interpretar_titulo(titulo):
    """'1º Administração - Bariri' -> (1, 'Administração - Bariri') ou None."""
    t = limpar_ruido_borda(titulo)
    t = re.sub(r"\bPl\b", "PI", t)            # I maiúsculo lido como l minúsculo
    m = re.match(r"^\s*([123])\s*[ºo°ª]\s*(.+)$", t)
    if not m:
        return None
    nome = limpar_ruido_borda(m.group(2))
    return int(m.group(1)), (nome or None)


def minutos(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def hhmm(minutos_):
    return f"{minutos_ // 60:02d}:{minutos_ % 60:02d}"


def parse_rotulo(txt, duracao=(40, 60)):
    """'19:00 19:50' -> (1140, 1190), ou None se não for um par de horários válido
    (horas 0-23, minutos 0-59, duração plausível de uma aula)."""
    achados = re.findall(r"(\d{1,2}):(\d{2})", txt or "")
    if len(achados) != 2:
        return None
    pares = [(int(h), int(m)) for h, m in achados]
    if any(h > 23 or m > 59 for h, m in pares):
        return None
    ini, fim = (h * 60 + m for h, m in pares)
    return (ini, fim) if duracao[0] <= fim - ini <= duracao[1] else None


def reparar_marcador_final(materia):
    """O '/TB' final costuma ser ilegível ('TAB', 'TA ii', 'TA mB', 'TA NB'...).
    Repara SÓ o padrão inequívoco: termina em 'TA' + 1-3 letras de lixo e a célula não
    tem nenhum 'TB' em outro lugar. Devolve (texto, foi_reparado)."""
    if re.search(r"\bT[AB]\s*/\s*T[AB]\s*$", materia) or re.search(r"\bTB\b", materia):
        return materia, False
    # Quando o PDF corta a célula depois de "TA /", o gabarito pode confirmar
    # explicitamente o nome da disciplina e o marcador completo TA / TB.
    if re.search(r"\bTA\s*/\s*$", materia):
        return limpar_espacos(re.sub(r"\bTA\s*/\s*$", "TA / TB", materia)), True
    m = re.search(r"\bTA\s*[A-Za-z|!1]{1,3}\s*[A-Za-z]?\s*$", materia)
    if m:
        return limpar_espacos(materia[:m.start()] + "TA / TB"), True
    return materia, False


def texto_suspeito(materia):
    """Tokens de uma letra que não existem em português ('M es') indicam leitura quebrada."""
    ok = {"e", "E", "a", "A", "o", "O", "I", "V", "X"}
    # palavra longa iniciada em minúscula ('nformação'): costuma ser a 1ª letra engolida
    if any(len(t) >= 5 and t[0].islower() for t in re.findall(r"[A-Za-zÀ-ú]+", materia)):
        return True
    return any(len(t) == 1 and t not in ok for t in re.findall(r"[A-Za-zÀ-ú]+", materia)) \
        or len(re.findall(r"[A-Za-zÀ-ú]", materia)) < 3
