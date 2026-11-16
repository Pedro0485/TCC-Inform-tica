"""Regras de consistência sobre o resultado final e alertas para a revisão."""
import re
from collections import defaultdict

from .normalizacao import chave_nome, hhmm


def alerta(nivel, codigo, mensagem, **ctx):
    a = {"nivel": nivel, "codigo": codigo, "mensagem": mensagem}
    a.update({k: v for k, v in ctx.items() if v is not None})
    return a


def validar_aulas_da_turma(turma):
    """Campos obrigatórios, ordem dos horários e duplicidade (turma+dia+início)."""
    alertas, vistos = [], {}
    for a in turma["aulas"]:
        ctx = dict(pagina=turma["pagina"], turma=turma["titulo_original"],
                   dia_semana=a["dia_semana"], hora_inicio=a["hora_inicio"])
        if not a["materia"]:
            alertas.append(alerta("erro", "MATERIA_AUSENTE", "Aula sem nome de disciplina.", **ctx))
            a["requer_revisao"] = True
        if len(a["materia"] or "") > 150:
            alertas.append(alerta("erro", "MATERIA_LONGA", "Nome da disciplina com mais de 150 caracteres.", **ctx))
        if a["hora_inicio"] >= a["hora_fim"]:
            alertas.append(alerta("erro", "HORARIO_INVALIDO", "Horário de início não é anterior ao de término.", **ctx))
        chave = (a["dia_semana"], a["hora_inicio"])
        if chave in vistos:
            alertas.append(alerta("erro", "AULA_DUPLICADA",
                                  "Mais de uma aula no mesmo dia e horário para esta turma.", **ctx))
        vistos[chave] = True
    return alertas


def conflitos_de_professores(turmas):
    """Mesmo professor em duas turmas ao mesmo tempo (aviso: pode ser aula conjunta)."""
    ocupacao = defaultdict(list)
    for t in turmas:
        for a in t["aulas"]:
            for p in a["professores"]:
                ocupacao[(chave_nome(p), a["dia_semana"], a["hora_inicio"])].append((p, t["titulo_original"], a))
    avisos = []
    for (_, dia, ini), itens in ocupacao.items():
        turmas_distintas = {i[1] for i in itens}
        if len(turmas_distintas) > 1:
            nome = itens[0][0]
            for _, titulo, aula in itens:
                aula.setdefault("alertas", []).append("PROFESSOR_EM_DUAS_TURMAS")
            avisos.append(alerta("aviso", "PROFESSOR_EM_DUAS_TURMAS",
                                 f"{nome} aparece em {len(turmas_distintas)} turmas ao mesmo tempo "
                                 f"({', '.join(sorted(turmas_distintas))}). Pode ser aula conjunta.",
                                 dia_semana=dia, hora_inicio=ini))
    return avisos


def nomes_parciais(nomes):
    """'Marcia Regina' x 'Marcia Regina Zugliani': possivelmente a mesma pessoa."""
    toks = {n: chave_nome(n).split() for n in nomes}
    avisos = []
    for a in nomes:
        for b in nomes:
            if a != b and len(toks[a]) >= 2 and len(toks[a]) < len(toks[b]) \
                    and toks[b][:len(toks[a])] == toks[a]:
                avisos.append(alerta("aviso", "POSSIVEL_MESMO_PROFESSOR",
                                     f"'{a}' pode ser o mesmo professor que '{b}'. Se for, "
                                     f"corrija o nome na tabela de professores antes de importar."))
    return avisos


def turmas_duplicadas(turmas):
    vistos, avisos = {}, []
    for t in turmas:
        if not t["nome"]:
            continue
        k = (t["ano"], t["nome"].lower())
        if k in vistos:
            avisos.append(alerta("erro", "TURMA_DUPLICADA_NO_PDF",
                                 f"A turma '{t['titulo_original']}' aparece mais de uma vez no PDF "
                                 f"(páginas {vistos[k]} e {t['pagina']}).", pagina=t["pagina"]))
        vistos[k] = t["pagina"]
    return avisos
