"""Orquestra: PDF -> grade -> OCR -> consenso -> validação -> JSON padronizado."""
import hashlib
import sys
from collections import Counter, defaultdict

from . import VERSAO_ESQUEMA
from . import config as C
from . import consenso as K
from . import extracao as E
from . import interpretacao as I
from . import ocr, validacao as V
from .erros import ErroLeituraPDF
from .normalizacao import (chave_nome, formatar_nome, hhmm, limpar_ruido_borda,
                           marcador_grupo_suspeito, normalizar_materia, reparar_marcador_final,
                           texto_suspeito)

# CORRIGIDO_PELA_GRADE é só informativo (a maioria das páginas confirma o horário);
# os demais pedem que a coordenadora confira a tabela de horários da turma.
CODIGOS_HORARIO_A_CONFERIR = {"HORARIO_CORRIGIDO_POR_CONTEXTO", "HORARIO_INFERIDO_DA_GRADE",
                              "HORARIO_DIVERGE_DA_GRADE", "HORARIO_ILEGIVEL"}


def _sha256(caminho):
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def _turno(linhas_horario, tem_bloqueio_meio):
    ini = min(l[0] for l in linhas_horario)
    fim = max(l[1] for l in linhas_horario)
    if ini >= 17 * 60:
        return "noturno"
    if ini >= 12 * 60:
        return "vespertino"
    if fim <= 12 * 60 + 40:
        return "matutino"
    if ini < 12 * 60 and fim > 13 * 60:
        return "integral"
    return None


def _log(msg):
    print(msg, file=sys.stderr, flush=True)


def ler_paginas(caminho, progresso=None, apenas=None):
    """Etapa 1 (lenta): PDF -> grade -> OCR de cada página. Devolve (paginas, alertas, total).
    `apenas` (conjunto de nºs de página) permite processar em lotes."""
    prog = progresso or (lambda etapa, pct, msg: None)
    ocr.verificar_tesseract()
    paginas, alertas_globais = [], []
    total = 1
    for numero, total, imagem, tem_texto in E.abrir_paginas(caminho):
        if apenas is not None and numero not in apenas:
            continue
        prog("leitura", 3 + int(72 * (numero - 1) / max(total, 1)), f"Lendo página {numero} de {total}")
        if imagem is None:
            alertas_globais.append(V.alerta("erro", "PAGINA_SEM_IMAGEM",
                "Página sem imagem de grade (PDF com texto selecionável não é suportado).", pagina=numero))
            continue
        grade = E.detectar_grade(numero, imagem)
        if grade is None:
            alertas_globais.append(V.alerta("erro", "GRADE_NAO_ENCONTRADA",
                "Nenhuma grade de horários foi reconhecida nesta página.", pagina=numero))
            continue
        ano, nome, titulo_bruto = I.ler_titulo(grade)
        dias, alertas_dias = I.ler_dias(grade)
        rotulos = I.ler_rotulos(grade)
        leituras = I.ler_celulas(grade)
        paginas.append({
            "numero": numero, "ano": ano, "nome": nome, "titulo_bruto": titulo_bruto,
            "dias": dias, "alertas_dias": alertas_dias, "rotulos": rotulos,
            "n_linhas": grade.n_linhas,
            "celulas": [(c.linha, c.coluna, c.tipo) for c in grade.celulas],
            "leituras": {k: I.montar_aula_bruta(v) for k, v in leituras.items()},
        })
        del imagem, grade
    return paginas, alertas_globais, total


def processar_pdf(caminho, progresso=None):
    """Pipeline completo: ler_paginas + consolidar."""
    sha = _sha256(caminho)
    paginas, alertas_globais, total = ler_paginas(caminho, progresso)
    return consolidar(paginas, alertas_globais, total, sha, progresso)


def consolidar(paginas, alertas_globais, total, sha, progresso=None):
    """Etapa 2 (rápida): consenso entre páginas, montagem e validação. Sem OCR."""
    prog = progresso or (lambda etapa, pct, msg: None)
    alertas_globais = list(alertas_globais)
    if not paginas:
        raise ErroLeituraPDF("Nenhuma grade de horários foi reconhecida no PDF.", "GRADE_NAO_ENCONTRADA")

    # ------------------------------------------------------------- consenso
    prog("interpretacao", 78, "Reconciliando horários e nomes")
    for pg in paginas:
        for b in pg["leituras"].values():
            b["materia"] = normalizar_materia(b["materia"])      # idempotente
            b["marcador_suspeito"] = marcador_grupo_suspeito(b["materia"])
            if b["cortado"]:
                continue
            reparada, ok = reparar_marcador_final(b["materia"])
            if ok:
                b["materia_ocr"], b["materia"], b["marcador_reparado"] = b["materia"], reparada, True
                b["marcador_suspeito"] = marcador_grupo_suspeito(reparada)
    grade_horarios = K.reconciliar_grade({p["numero"]: p["rotulos"] for p in paginas})

    cont_prof, formas_prof, cont_mat = Counter(), defaultdict(list), Counter()
    for p in paginas:
        for bruto in p["leituras"].values():
            if not bruto["independente"]:
                continue
            for n in bruto["professores_brutos"]:
                k = chave_nome(n)
                cont_prof[k] += 1
                formas_prof[k].append(n.upper())
            if bruto["materia"] and not bruto["cortado"]:
                cont_mat[bruto["materia"]] += 1
    mapa_prof, _ = K.agrupar(cont_prof, C.SIM_MESCLA_NOME, C.MIN_OCORR_CABECA_NOME, C.RAZAO_CABECA_VARIANTE)
    # Nomes que diferem só por ESPAÇO são o mesmo nome: a fonte dos prints cria um vão antes
    # de certas letras ("ME SQUITA", "FRA SSON"). Fica a grafia com menos palavras.
    chaves_por_forma = defaultdict(list)
    for k in cont_prof:                       # TODAS as grafias lidas, não só as cabeças
        chaves_por_forma[k.replace(" ", "")].append(k)
    canonica = {forma: min(ks, key=lambda x: (len(x.split()), -cont_prof[x], x))
                for forma, ks in chaves_por_forma.items()}
    mapa_prof = {k: canonica[cabeca.replace(" ", "")] for k, cabeca in mapa_prof.items()}
    mapa_mat, _ = K.agrupar(cont_mat, C.SIM_MESCLA_DISCIPLINA, 2, 2.0, usar_assinatura=True, sim_forte=0.95)
    exibicao = {}
    for cabeca in set(mapa_prof.values()):
        exibicao[cabeca] = formatar_nome(K.mais_comum(formas_prof[cabeca]))
    leituras_por_prof = Counter()
    for k, n in cont_prof.items():
        leituras_por_prof[mapa_prof[k]] += n

    # --------------------------------------------------------- montar saída
    prog("validacao", 88, "Validando resultado")
    turmas, correcoes, contagem_aulas_prof, variantes_prof = [], [], Counter(), defaultdict(set)
    for p in paginas:
        titulo = (f"{p['ano']}º {p['nome']}" if p["ano"] and p["nome"] else limpar_ruido_borda(p["titulo_bruto"] or ""))
        turma = {"pagina": p["numero"], "titulo_original": titulo, "ano": p["ano"], "nome": p["nome"],
                 "turno_sugerido": None, "aulas": [], "periodos_bloqueados": [], "alertas": []}
        ctx = dict(pagina=p["numero"], turma=titulo or None)
        if p["ano"] is None or not p["nome"]:
            turma["alertas"].append(V.alerta("erro", "TITULO_ILEGIVEL",
                "Não foi possível identificar o ano e o nome da turma neste título.", **ctx))
        if p["dias"] is None:
            turma["alertas"].append(V.alerta("erro", "CABECALHO_DIAS_ILEGIVEL",
                "Não foi possível confirmar os dias da semana desta página.", **ctx))
        for cod in p["alertas_dias"]:
            if cod != "CABECALHO_DIAS_ILEGIVEL":
                turma["alertas"].append(V.alerta("aviso", cod, "Dia da semana não confirmado pelo cabeçalho.", **ctx))
        horarios = grade_horarios[p["numero"]]
        validos = [h for h in horarios if h]
        turma["linhas_horario"] = [
            {"linha": i, "hora_inicio": hhmm(h[0]) if h else None, "hora_fim": hhmm(h[1]) if h else None,
             "alertas": sorted(h[2]) if h else ["HORARIO_ILEGIVEL"]} for i, h in enumerate(horarios)]
        turma["horarios_para_conferir"] = any(set(l["alertas"]) & CODIGOS_HORARIO_A_CONFERIR for l in turma["linhas_horario"])
        if turma["horarios_para_conferir"]:
            turma["alertas"].append(V.alerta("aviso", "HORARIOS_PARA_CONFERIR",
                "Alguns horários desta turma foram corrigidos ou deduzidos a partir da grade. Confira a tabela de horários.", **ctx))
        if validos:
            turma["turno_sugerido"] = _turno(validos, True)
        for li, co, tipo in p["celulas"]:
            if p["dias"] is None or co >= len(p["dias"]) or tipo == "vazio":
                continue
            h = horarios[li]
            dia = p["dias"][co]
            if h is None:
                if tipo == "aula":
                    turma["alertas"].append(V.alerta("erro", "HORARIO_ILEGIVEL",
                        "O horário desta linha não pôde ser lido.", dia_semana=dia, **ctx))
                continue
            ini, fim, cods_h = h
            if tipo == "bloqueado":
                turma["periodos_bloqueados"].append({"dia_semana": dia, "hora_inicio": hhmm(ini), "hora_fim": hhmm(fim)})
                continue
            b = p["leituras"][(li, co)]
            materia = mapa_mat.get(b["materia"], b["materia"]) if not b["cortado"] else b["materia"]
            codigos, motivos = list(cods_h), []
            if b.get("marcador_reparado"):
                codigos.append("MARCADOR_GRUPO_REPARADO")
            if materia != b["materia"]:
                codigos.append("DISCIPLINA_CORRIGIDA_POR_CONSENSO")
                correcoes.append({"tipo": "disciplina", "de": b["materia"], "para": materia, "pagina": p["numero"]})
            nomes, originais = [], []
            for n in b["professores_brutos"]:
                final = exibicao[mapa_prof[chave_nome(n)]]
                if final not in nomes:
                    nomes.append(final)
                if chave_nome(n) != mapa_prof[chave_nome(n)]:
                    originais.append(n)
                    variantes_prof[final].add(formatar_nome(n))
                    correcoes.append({"tipo": "professor", "de": formatar_nome(n), "para": final, "pagina": p["numero"]})
                    codigos.append("PROFESSOR_CORRIGIDO_POR_CONSENSO")
            if b["cortado"]:
                motivos.append("TEXTO_CORTADO_NA_ORIGEM")
            if marcador_grupo_suspeito(materia):
                motivos.append("MARCADOR_GRUPO_SUSPEITO")
            if not nomes and not b["placeholders"]:
                motivos.append("PROFESSOR_NAO_LIDO")
            if b["placeholders"]:
                codigos.append("PROFESSOR_NAO_ATRIBUIDO")
            if len(nomes) >= 2 and b["grupos"]:
                codigos.append("ASSOCIACAO_PROFESSOR_GRUPO_INDEFINIDA")
            confirmada = (not b["cortado"]) and cont_mat.get(materia, 0) >= 2
            # repetir a MESMA leitura não é evidência independente (mesma imagem, mesmo erro):
            # só eleva a confiança se o OCR já tinha confiança razoável na leitura
            conf_corpo = max(b["corpo_conf"], 0.9) if (confirmada and b["corpo_conf"] >= 0.6) else b["corpo_conf"]
            nomes_ok = bool(nomes) and all(leituras_por_prof[mapa_prof[chave_nome(n)]] >= C.MIN_OCORR_CABECA_NOME
                                           for n in b["professores_brutos"])
            conf_nomes = max(b["rodape_conc"], 0.9) if nomes_ok else b["rodape_conc"]
            confianca = round(min(conf_corpo, conf_nomes if nomes else 1.0), 2)
            if texto_suspeito(materia):
                motivos.append("TEXTO_SUSPEITO")
            if confianca < 0.75:
                motivos.append("BAIXA_CONFIANCA")
            for n in nomes:
                contagem_aulas_prof[n] += 1
            turma["aulas"].append({
                "dia_semana": dia, "hora_inicio": hhmm(ini), "hora_fim": hhmm(fim),
                "materia": materia, "professores": nomes, "grupos": b["grupos"],
                "confianca": confianca, "requer_revisao": bool(motivos),
                "motivos_revisao": sorted(set(motivos)), "alertas": sorted(set(codigos)),
                "origem": {"pagina": p["numero"], "linha": li, "coluna": co},
                **({"materia_original": b.get("materia_ocr", b["materia"])} if (materia != b["materia"] or b.get("marcador_reparado")) else {}),
                **({"professores_originais": originais} if originais else {}),
                **({"professor_placeholder": b["placeholders"]} if b["placeholders"] else {}),
            })
        turma["alertas"] += V.validar_aulas_da_turma(turma)
        turmas.append(turma)

    # ------------------------------------------------------ professores / alertas
    professores = []
    for nome in sorted(contagem_aulas_prof):
        pontos = [c for c in K_cabecas(exibicao, nome)]
        indep = sum(leituras_por_prof[c] for c in pontos)
        alertas_p = []
        if indep < 2:
            alertas_p.append("VISTO_UMA_VEZ")
        if len(nome.split()) == 1:
            alertas_p.append("NOME_UMA_PALAVRA")
        professores.append({"nome": nome, "aulas": contagem_aulas_prof[nome], "leituras_independentes": indep,
                            "variantes_corrigidas": sorted(variantes_prof.get(nome, [])), "alertas": alertas_p})
    alertas = list(alertas_globais)
    for t in turmas:
        alertas += t["alertas"]
    alertas += V.turmas_duplicadas(turmas)
    alertas += V.nomes_parciais([p["nome"] for p in professores])
    alertas += V.conflitos_de_professores(turmas)

    todas = [a for t in turmas for a in t["aulas"]]
    por_codigo = Counter(c for a in todas for c in a["alertas"] + a["motivos_revisao"])
    resumo = {
        "paginas": total, "paginas_lidas": len(paginas), "turmas": len(turmas), "aulas": len(todas),
        "aulas_para_revisao": sum(1 for a in todas if a["requer_revisao"]),
        "professores": len(professores),
        "periodos_bloqueados": sum(len(t["periodos_bloqueados"]) for t in turmas),
        "correcoes_automaticas": len(correcoes),
        "alertas_erro": sum(1 for a in alertas if a["nivel"] == "erro"),
        "alertas_aviso": sum(1 for a in alertas if a["nivel"] == "aviso"),
        "por_codigo": dict(por_codigo),
    }
    prog("concluido", 100, "Leitura concluída")
    return {"versao_esquema": VERSAO_ESQUEMA, "arquivo": {"sha256": sha, "paginas": total},
            "turmas": turmas, "professores": professores, "correcoes": correcoes,
            "alertas": alertas, "resumo": resumo}


def K_cabecas(exibicao, nome):
    return [cabeca for cabeca, exib in exibicao.items() if exib == nome]
