"""Correção conservadora por votação entre ocorrências.

O mesmo professor/disciplina aparece dezenas de vezes no conjunto de PDFs,
e os erros de OCR variam de uma ocorrência para outra. Então a leitura
frequente "ganha" da rara quando as duas são muito parecidas.

Regras de segurança (para não fundir coisas diferentes):
  * a cabeça do grupo precisa ser frequente e MAIS frequente que a variante;
  * a "assinatura crítica" (números, romanos, TA/TB, em ordem) tem que ser igual:
    'Banco de Dados I' != 'Banco de Dados II', 'TA/..TB' != 'TB/..TA';
  * toda correção é registrada para aparecer na pré-visualização.
"""
import difflib
import re
from collections import Counter
from itertools import combinations, product

from . import config as C
from .normalizacao import hhmm, minutos, parse_rotulo

_RE_CRITICO = re.compile(r"^(T[AB]|\d+|[IVX]+)$", re.I)


def _forma(t):
    return re.sub(r"\s+", "", t)


def assinatura_critica(texto):
    return tuple(t.upper() for t in re.findall(r"[A-Za-z0-9]+", texto) if _RE_CRITICO.match(t))


def similaridade(a, b):
    r = max(difflib.SequenceMatcher(None, a, b).ratio(),
            difflib.SequenceMatcher(None, _forma(a), _forma(b)).ratio())
    fa, fb = _forma(a), _forma(b)
    curto, longo = (fa, fb) if len(fa) <= len(fb) else (fb, fa)
    if len(curto) >= 5 and longo.startswith(curto) and len(longo) - len(curto) <= 4:
        r = max(r, 0.95)                      # palavra final truncada pelo OCR
    return r


def agrupar(contagens, sim_mescla, min_cabeca, razao, sim_aviso=None, usar_assinatura=False,
            sim_forte=None):
    """contagens: Counter {chave: nº de leituras independentes}.
    Devolve (mapa {chave: cabeça}, parecidos [(chave, cabeça, sim)] não fundidos)."""
    ordem = sorted(contagens, key=lambda k: (-contagens[k], k))
    cabecas, mapa, parecidos = [], {}, []
    for k in ordem:
        alvo = None
        for h in cabecas:
            sim = similaridade(k, h)
            seguro = (not usar_assinatura) or assinatura_critica(k) == assinatura_critica(h)
            if sim >= sim_mescla and seguro and contagens[h] >= min_cabeca \
                    and contagens[h] >= razao * contagens[k]:
                alvo = h
                break
            # quase idênticas (>= sim_forte): basta a cabeça ser estritamente mais frequente
            if sim_forte and sim >= sim_forte and seguro and contagens[h] >= min_cabeca \
                    and contagens[h] > contagens[k]:
                alvo = h
                break
            if sim_aviso and sim >= sim_aviso:
                parecidos.append((k, h, round(sim, 2)))
        if alvo:
            mapa[k] = alvo
        else:
            cabecas.append(k)
            mapa[k] = k
    return mapa, parecidos


def mais_comum(valores):
    return Counter(valores).most_common(1)[0][0]


# ----------------------------------------------------------------- grade de horários
def _parse_rotulo(txt):
    return parse_rotulo(txt, C.DURACAO_AULA_MIN)


def _so_confusoes(a, b):
    if len(a) != len(b):
        return False
    return all(x == y or frozenset((x, y)) in C.CONFUSOES_DIGITOS for x, y in zip(a, b))


def _digitos(par):
    return re.sub(r"\D", "", f"{hhmm(par[0])}{hhmm(par[1])}")


def _corresponde_a_sufixo(bruto, moda):
    """Prints cortados à esquerda perdem o 1º dígito ('21:00' vira '1:00', que o OCR ainda
    pode ler '4:00'). True se cada horário lido é o SUFIXO do horário da grade, tolerando
    confusões de dígito, e pelo menos um está de fato mais curto."""
    toks = re.findall(r"\d{1,2}:\d{2}", bruto or "")
    esperado = [hhmm(moda[0]), hhmm(moda[1])]
    if len(toks) != 2 or not any(len(t) < len(e) for t, e in zip(toks, esperado)):
        return False
    for t, e in zip(toks, esperado):
        if len(t) > len(e) or not _so_confusoes(t.replace(":", ""), e[len(e) - len(t):].replace(":", "")):
            return False
    return True


def reparar_por_contexto(bruto, fim_anterior, duracao_padrao, max_trocas=2):
    """Conserta um rótulo ilegível trocando SÓ dígitos que o OCR confunde, e só se:
    a duração for a padrão da grade, o início não vier antes do fim da linha anterior
    e houver UMA única solução com o menor nº de trocas. Senão devolve None."""
    digitos = re.sub(r"\D", "", bruto or "")
    if len(digitos) != 8:
        return None
    alternativas = [[d] + [x for x in "0123456789" if frozenset((d, x)) in C.CONFUSOES_DIGITOS]
                    for d in digitos]
    for trocas in range(0, max_trocas + 1):
        achados = set()
        for posicoes in combinations(range(8), trocas):
            for novos in product(*[alternativas[p][1:] for p in posicoes]):
                cand = list(digitos)
                for p, nv in zip(posicoes, novos):
                    cand[p] = nv
                txt = f"{''.join(cand[:2])}:{''.join(cand[2:4])} {''.join(cand[4:6])}:{''.join(cand[6:])}"
                par = _parse_rotulo(txt)
                if par and par[1] - par[0] == duracao_padrao and (fim_anterior is None or par[0] >= fim_anterior):
                    achados.add(par)
        if len(achados) == 1:
            return achados.pop()
        if len(achados) > 1:
            return None          # ambíguo: não escolhe
    return None


def reconciliar_grade(rotulos_por_pagina):
    """rotulos_por_pagina: {pagina: [texto OCR de cada linha]}.
    Todas as páginas de um mesmo PDF compartilham a grade; vota o horário de cada
    linha entre as páginas com o mesmo nº de linhas e só aceita corrigir o OCR
    quando a diferença é uma confusão conhecida de dígitos.
    Devolve {pagina: [(ini_min, fim_min, [codigos_de_alerta]) | None por linha]}."""
    grupos = {}
    for pag, rots in rotulos_por_pagina.items():
        grupos.setdefault(len(rots), []).append(pag)
    saida = {}

    def duracao_padrao(pg):
        d = Counter(p[1] - p[0] for p in (_parse_rotulo(t) for t in rotulos_por_pagina[pg]) if p)
        return d.most_common(1)[0][0] if d else 50

    for n, paginas in grupos.items():
        modas = []
        for i in range(n):
            validos = [p for p in (_parse_rotulo(rotulos_por_pagina[pg][i]) for pg in paginas) if p]
            if validos:
                (par, cont), = Counter(validos).most_common(1)
                modas.append((par, cont / len(paginas)))
            else:
                modas.append((None, 0.0))
        for pg in paginas:
            linhas = []
            for i in range(n):
                bruto = rotulos_por_pagina[pg][i]
                proprio = _parse_rotulo(bruto)
                moda, apoio = modas[i]
                lidos = {p for p in (_parse_rotulo(rotulos_por_pagina[o][i]) for o in paginas) if p}
                # "forte": a maioria concorda OU todas as páginas legíveis são unânimes
                forte = moda is not None and (apoio >= C.MIN_APOIO_GRADE or len(lidos) == 1)
                if proprio and (not forte or proprio == moda):
                    linhas.append((proprio[0], proprio[1], []))
                elif proprio and forte:
                    if _so_confusoes(_digitos(proprio), _digitos(moda)) or _corresponde_a_sufixo(bruto, moda):
                        linhas.append((moda[0], moda[1], ["HORARIO_CORRIGIDO_PELA_GRADE"]))
                    else:      # diverge de verdade da grade das outras páginas: não "conserta"
                        linhas.append((proprio[0], proprio[1], ["HORARIO_DIVERGE_DA_GRADE"]))
                elif forte:     # ilegível aqui; as outras páginas concordam
                    so_confusao = (_so_confusoes(re.sub(r"\D", "", bruto or ""), _digitos(moda))
                                   or _corresponde_a_sufixo(bruto, moda))
                    cod = "HORARIO_CORRIGIDO_PELA_GRADE" if so_confusao else "HORARIO_INFERIDO_DA_GRADE"
                    linhas.append((moda[0], moda[1], [cod]))
                else:
                    fim_ant = linhas[-1][1] if linhas and linhas[-1] else None
                    reparado = reparar_por_contexto(bruto, fim_ant, duracao_padrao(pg))
                    linhas.append((reparado[0], reparado[1], ["HORARIO_CORRIGIDO_POR_CONTEXTO"]) if reparado else None)
            saida[pg] = linhas
    return saida
