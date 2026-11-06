"""Leitura de uma página (título, dias, horários, células) e interpretação
de cada célula como uma aula estruturada."""
import difflib
import re
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from . import config as C
from . import extracao as E
from . import ocr
from .normalizacao import (grupos_da_materia, interpretar_titulo, marcador_grupo_suspeito,
                           normalizar_materia, sem_acentos, separar_professores)


def _casar_dia(texto):
    t = re.sub(r"[^a-z]", "", sem_acentos(texto).lower())
    melhor, nota = None, 0.0
    for dia in C.DIAS_ORDEM[:5]:
        alvo = dia + "feira"
        r = difflib.SequenceMatcher(None, t, alvo).ratio()
        if r > nota:
            melhor, nota = dia, r
    if "sabado" in t or difflib.SequenceMatcher(None, t, "sabado").ratio() > nota:
        return "sabado", 0.9
    return (melhor, nota) if nota >= 0.72 else (None, nota)


def ler_titulo(pagina):
    brutos = ocr.ocr_titulo(E.recorte_titulo(pagina))
    for b in brutos:
        r = interpretar_titulo(b)
        if r and r[1]:
            return r[0], r[1], b
    return None, None, (brutos[0] if brutos else "")


def ler_dias(pagina):
    """Dia de cada coluna, confirmado pelo cabeçalho. Devolve (dias, alertas)."""
    lidos = [_casar_dia(ocr.ocr_cabecalho_dia(E.recorte_cabecalho_coluna(pagina, c)))[0]
             for c in range(pagina.n_colunas)]
    posicional = C.DIAS_ORDEM[:pagina.n_colunas]
    if lidos == posicional:
        return posicional, []
    confere = sum(1 for a, b in zip(lidos, posicional) if a == b)
    if len(set(x for x in lidos if x)) == len([x for x in lidos if x]) and None not in lidos:
        return lidos, ["DIAS_LIDOS_DO_CABECALHO"]       # ordem diferente do padrão, mas legível
    if confere >= max(1, pagina.n_colunas - 1):
        return posicional, ["DIA_NAO_CONFIRMADO_NO_CABECALHO"]
    return None, ["CABECALHO_DIAS_ILEGIVEL"]


def ler_rotulos(pagina):
    return [ocr.ocr_rotulo_horario(E.recorte_rotulo_linha(pagina, i)) for i in range(pagina.n_linhas)]


def _iguais(a, b):
    """Duas células com o mesmo conteúdo visual (aula que ocupa 2 períodos seguidos)."""
    if a.imagem.shape != b.imagem.shape:
        return False
    d = np.abs(a.imagem[3:-3, 3:-3].astype(np.int16) - b.imagem[3:-3, 3:-3].astype(np.int16))
    return float(d.mean()) < 2.5


def _ler_celula(cel):
    texto, conf, cortado = ocr.ocr_corpo(cel.imagem)
    rod, conc = ocr.ocr_rodape(cel.imagem)
    return {"corpo": texto, "corpo_conf": conf, "cortado": cortado,
            "rodape": rod, "rodape_conc": conc}


def ler_celulas(pagina):
    """OCR de cada célula de aula. Períodos consecutivos idênticos são lidos uma só vez.
    Devolve {(linha, coluna): leitura}, onde leitura['independente'] diz se foi uma
    leitura nova (True) ou cópia da linha anterior (False)."""
    aulas = [c for c in pagina.celulas if c.tipo == "aula"]
    por_coluna = {}
    for c in aulas:
        por_coluna.setdefault(c.coluna, []).append(c)
    unicas, origem = [], {}
    for col, lista in por_coluna.items():
        lista.sort(key=lambda c: c.linha)
        anterior = None
        for c in lista:
            if anterior is not None and c.linha == anterior.linha + 1 and _iguais(anterior, c):
                origem[(c.linha, c.coluna)] = origem[(anterior.linha, anterior.coluna)]
            else:
                origem[(c.linha, c.coluna)] = (c.linha, c.coluna)
                unicas.append(c)
            anterior = c
    with ThreadPoolExecutor(max_workers=C.THREADS_OCR) as pool:
        lidas = dict(zip([(c.linha, c.coluna) for c in unicas], pool.map(_ler_celula, unicas)))
    return {chave: {**lidas[orig], "independente": orig == chave} for chave, orig in origem.items()}


def montar_aula_bruta(leitura):
    """Leitura de célula -> campos já normalizados (antes do consenso)."""
    materia = normalizar_materia(leitura["corpo"])
    pessoas, placeholders = [], []
    for nome in separar_professores(leitura["rodape"]):
        from .normalizacao import eh_placeholder
        (placeholders if eh_placeholder(nome) else pessoas).append(nome)
    return {
        "materia": materia,
        "professores_brutos": pessoas,
        "placeholders": placeholders,
        "grupos": grupos_da_materia(materia),
        "marcador_suspeito": marcador_grupo_suspeito(materia),
        "cortado": leitura["cortado"],
        "corpo_conf": leitura["corpo_conf"],
        "rodape_conc": leitura["rodape_conc"],
        "independente": leitura["independente"],
    }
