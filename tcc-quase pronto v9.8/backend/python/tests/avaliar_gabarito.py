"""Compara a saída da CLI com o gabarito lido visualmente nos PDFs reais.

    python read_horarios_pdf.py "Horário_NOITE.pdf"   > noite.json
    python read_horarios_pdf.py "Horário_PI  MANHÃ.pdf" > manha.json
    python tests/avaliar_gabarito.py noite.json manha.json

Mede: células com disciplina E professores exatos, e quantos erros ficaram SEM sinalização
(o número que mais importa: erro sinalizado vai para revisão humana, erro silencioso não).
"""
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(__file__))
from gold_corpos import GOLD  # noqa: E402
from gold_professores import GP  # noqa: E402


def nz(s):
    return re.sub(r"[\s/|]+", "", s.lower())


def kn(s):
    return re.sub(r"[^A-Z]", "", unicodedata.normalize("NFD", s).upper().encode("ascii", "ignore").decode())


def avaliar(caminho, tipo):
    r = json.load(open(caminho, encoding="utf-8"))
    d = r["dados"]
    tot = ok = sem_flag = 0
    for (kind, pg), grade in GOLD.items():
        if kind != tipo:
            continue
        idx = {(a["origem"]["linha"], a["origem"]["coluna"]): a for a in d["turmas"][0]["aulas"]}
        for li, row in enumerate(grade):
            for co, esperado in enumerate(row):
                if esperado is None:
                    assert (li, co) not in idx, f"célula vazia/bloqueada virou aula: {(li, co)}"
                    continue
                a = idx[(li, co)]
                tot += 1
                certo = nz(a["materia"]) == nz(esperado) and \
                    [kn(x) for x in a["professores"]] == [kn(x) for x in GP[(kind, pg)][li][co]]
                ok += certo
                if not certo:
                    sinalizado = a["requer_revisao"]
                    sem_flag += not sinalizado
                    print(f"  ✗ {kind} l{li}c{co}: {a['materia']!r} != {esperado!r}",
                          "(sinalizado p/ revisão)" if sinalizado else "(SEM SINALIZAÇÃO)")
    return tot, ok, sem_flag


if __name__ == "__main__":
    tipos = {"noite": "NOITE", "manha": "PIMANH"}
    T = O = S = 0
    for caminho in sys.argv[1:]:
        tipo = next(v for k, v in tipos.items() if k in caminho.lower())
        t, o, s = avaliar(caminho, tipo)
        print(f"{caminho}: {o}/{t} células exatas, {s} erros sem sinalização")
        T, O, S = T + t, O + o, S + s
    print(f"TOTAL: {O}/{T} ({O / T:.1%}); erros silenciosos: {S}")
    sys.exit(1 if S else 0)
