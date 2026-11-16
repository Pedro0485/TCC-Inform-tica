"""Lista OFICIAL de professores: corrige nomes lidos errado pelo OCR.

O arquivo é um texto simples, um nome por linha (linhas vazias e iniciadas por # são ignoradas).
Local: o caminho em HORARIOS_PROFESSORES ou, se não houver, `backend/python/professores.txt`.
Sem arquivo (ou vazio) o leitor funciona como antes.

Regras (conservadoras, para nunca trocar uma pessoa por outra):
  * mesmo nome sem acento/espaço/maiúscula            -> troca pelo nome oficial;
  * nome parcial (2+ palavras) que começa UM só oficial -> troca ('Marcia Regina' -> 'Marcia Regina Zugliani');
  * nome muito parecido (>= LIMIAR) e claramente melhor que o 2º colocado -> troca;
  * qualquer dúvida (empate, parecido demais com dois nomes) -> NÃO troca; o nome lido segue e
    aparece na revisão como antes.
"""
import difflib
import os
import re

from . import consenso as K
from .normalizacao import chave_nome, sem_acentos

LIMIAR = 0.86       # similaridade mínima (sem espaços) para trocar pelo nome oficial
MARGEM = 0.04       # o melhor candidato precisa ganhar do 2º por pelo menos isto

_PASTA_PYTHON = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def caminho_padrao():
    return os.environ.get("HORARIOS_PROFESSORES") or os.path.join(_PASTA_PYTHON, "professores.txt")


def carregar_professores(caminho=None):
    """Devolve a lista de nomes oficiais (sem repetidos). Arquivo ausente -> lista vazia."""
    caminho = caminho or caminho_padrao()
    try:
        with open(caminho, encoding="utf-8-sig") as f:
            linhas = f.read().splitlines()
    except OSError:
        return []
    vistos, nomes = set(), []
    for linha in linhas:
        nome = " ".join(linha.split())
        if not nome or nome.startswith("#"):
            continue
        k = chave_nome(nome).replace(" ", "")
        if k and k not in vistos:
            vistos.add(k)
            nomes.append(nome)
    return nomes


def _entidades(nomes):
    """Aceita strings legadas ou registros {nome_oficial, variacoes} vindos do Node."""
    saida = []
    for item in nomes or []:
        if isinstance(item, dict):
            nome = " ".join(str(item.get("nome_oficial") or item.get("nome") or "").split())
            variacoes = item.get("variacoes") or []
        else:
            nome, variacoes = " ".join(str(item).split()), []
        if nome:
            formas = [nome] + [" ".join(str(v).split()) for v in variacoes if str(v).strip()]
            saida.append((nome, list(dict.fromkeys(formas))))
    return saida


def casar_oficial_detalhe(chave_lida, nomes):
    """Correspondência conservadora: exata, prefixo único ou fuzzy com margem."""
    if not chave_lida or not nomes:
        return None
    entidades = _entidades(nomes)
    lida = chave_nome(chave_lida)
    compacto = lida.replace(" ", "")
    exatos = set()
    preparados = []
    for oficial, formas in entidades:
        for forma in formas:
            k = chave_nome(forma).replace(" ", "")
            if k:
                preparados.append((oficial, k))
                if k == compacto:
                    exatos.add(oficial)
    if len(exatos) == 1:
        return {"nome_oficial": next(iter(exatos)), "confianca": 1.0, "metodo": "normalizado_exato"}
    if len(exatos) > 1:
        return None
    toks = lida.split()
    if len(toks) >= 2:
        candidatos = {oficial for oficial, formas in entidades
                      if len(oficial.split()) > len(toks) and chave_nome(oficial).split()[:len(toks)] == toks}
        if len(candidatos) == 1:
            return {"nome_oficial": next(iter(candidatos)), "confianca": 0.94, "metodo": "prefixo_unico"}
    notas = {}
    for oficial, forma in preparados:
        score = difflib.SequenceMatcher(None, compacto, forma).ratio()
        notas[oficial] = max(score, notas.get(oficial, 0.0))
    melhores = sorted(notas.items(), key=lambda x: (-x[1], x[0]))
    if not melhores:
        return None
    melhor = melhores[0]
    segundo = melhores[1][1] if len(melhores) > 1 else 0.0
    if melhor[1] >= LIMIAR and melhor[1] - segundo >= MARGEM:
        return {"nome_oficial": melhor[0], "confianca": round(melhor[1], 4), "metodo": "similaridade_unica"}
    return None


def casar_oficial(chave_lida, nomes):
    """chave_lida: nome lido (já em chave_nome). nomes: lista oficial. -> nome oficial ou None."""
    detalhe = casar_oficial_detalhe(chave_lida, nomes)
    return detalhe["nome_oficial"] if detalhe else None


# =============================================================== MATÉRIAS (disciplinas)
# Arquivo `materias.txt` (ou HORARIOS_MATERIAS): um nome por linha, SEM o marcador TA/TB.
# O marcador de grupo lido no PDF é mantido como veio ("Estudos de Solos TA / TB").
# Células com duas disciplinas ("P. Org. Dep Pess TA / Apl Inf TB") são tratadas por pedaço.
# Proteções: números/romanos têm que ser IGUAIS ("Banco de Dados I" nunca vira "... II"),
# nomes curtos (< 6 letras) só trocam se forem idênticos, e dúvida/empate = não troca.
LIMIAR_MATERIA = 0.90
MARGEM_MATERIA = 0.04

_COMPOSTA = re.compile(r"^(?P<n1>.+?)(?P<s1>\s*-?\s*)(?P<m1>T[AB])\s*/\s*(?P<n2>.+?)(?P<s2>\s*-?\s*)(?P<m2>T[AB])$")
_SIMPLES = re.compile(r"^(?P<base>.+?)(?P<tail>\s*-?\s*T[AB](?:\s*/\s*T[AB])?)$")


def caminho_padrao_materias():
    return os.environ.get("HORARIOS_MATERIAS") or os.path.join(_PASTA_PYTHON, "materias.txt")


def _chave_materia(texto):
    return re.sub(r"[^A-Z0-9]", "", sem_acentos(texto or "").upper())


def carregar_materias(caminho=None):
    """Lista de matérias oficiais (sem repetidas). Arquivo ausente -> lista vazia."""
    caminho = caminho or caminho_padrao_materias()
    try:
        with open(caminho, encoding="utf-8-sig") as f:
            linhas = f.read().splitlines()
    except OSError:
        return []
    vistos, nomes = set(), []
    for linha in linhas:
        nome = " ".join(linha.split())
        if not nome or nome.startswith("#"):
            continue
        k = _chave_materia(nome)
        if k and (k, K.assinatura_critica(nome)) not in vistos:
            vistos.add((k, K.assinatura_critica(nome)))
            nomes.append(nome)
    return nomes


def _preparar_materias(nomes):
    preparados = []
    for oficial, formas in _entidades(nomes):
        for forma in formas:
            k = _chave_materia(forma)
            if k:
                preparados.append((oficial, k, K.assinatura_critica(forma)))
    return preparados


def _casar_base_detalhe(base, preparados, exigir_exato=False):
    k = _chave_materia(base)
    if not k:
        return None
    sig = K.assinatura_critica(base)
    candidatos = [(n, c) for n, c, s in preparados if s == sig]
    exatos = {nome for nome, forma in candidatos if forma == k}
    if len(exatos) == 1:
        return {"nome_oficial": next(iter(exatos)), "confianca": 1.0, "metodo": "normalizado_exato"}
    if len(exatos) > 1:
        return None
    if exigir_exato:
        return None
    if len(k) < 6 or not candidatos:
        return None
    notas = {}
    for nome, forma in candidatos:
        score = difflib.SequenceMatcher(None, k, forma).ratio()
        notas[nome] = max(score, notas.get(nome, 0.0))
    melhores = sorted(notas.items(), key=lambda x: (-x[1], x[0]))
    segundo = melhores[1][1] if len(melhores) > 1 else 0.0
    if melhores[0][1] >= LIMIAR_MATERIA and melhores[0][1] - segundo >= MARGEM_MATERIA:
        return {"nome_oficial": melhores[0][0], "confianca": round(melhores[0][1], 4), "metodo": "similaridade_unica"}
    return None


def _casar_base(base, preparados, exigir_exato=False):
    detalhe = _casar_base_detalhe(base, preparados, exigir_exato=exigir_exato)
    return detalhe["nome_oficial"] if detalhe else None


def ajustar_materia(texto, nomes, exigir_todas=False, exigir_exato=False):
    """Texto da célula (já normalizado) -> texto com o nome oficial, ou None se nada casou."""
    if not texto or not nomes:
        return None
    prep = _preparar_materias(nomes)
    m = _COMPOSTA.match(texto)
    if m and len(_chave_materia(m["n1"])) >= 3 and len(_chave_materia(m["n2"])) >= 3:
        a, b = (_casar_base(m["n1"], prep, exigir_exato),
                _casar_base(m["n2"], prep, exigir_exato))
        if exigir_todas and (not a or not b):
            return None
        if a or b:
            return f"{a or m['n1']}{m['s1']}{m['m1']} / {b or m['n2']}{m['s2']}{m['m2']}"
        return None
    m = _SIMPLES.match(texto)
    base, cauda = (m["base"], m["tail"]) if m else (texto, "")
    certo = _casar_base(base, prep, exigir_exato)
    return f"{certo}{cauda}" if certo else None
