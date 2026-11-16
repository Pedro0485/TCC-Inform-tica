"""Testes unitários (rápidos, sem OCR): normalização, consenso e validação."""
import os
import sys
import unittest
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from horarios_pdf import consenso as K  # noqa: E402
from horarios_pdf import normalizacao as N  # noqa: E402
from horarios_pdf import validacao as V  # noqa: E402


class TestNormalizacao(unittest.TestCase):
    def test_titulo_com_ruido_do_icone(self):
        self.assertEqual(N.interpretar_titulo("+ 1º Administração - Bariri :"), (1, "Administração - Bariri"))
        self.assertEqual(N.interpretar_titulo("2º Mtec - Pl - EDIFICAÇÕES"), (2, "Mtec - PI - EDIFICAÇÕES"))
        self.assertIsNone(N.interpretar_titulo("14º Mtec"))           # ano inválido: não adivinha
        self.assertIsNone(N.interpretar_titulo("sem ordinal"))

    def test_marcador_de_grupo(self):
        self.assertEqual(N.normalizar_materia("Estudos de Solos TAITB"), "Estudos de Solos TA / TB")
        self.assertEqual(N.normalizar_materia("Banco de Dados II TA/TB"), "Banco de Dados II TA / TB")
        self.assertEqual(N.normalizar_materia("P. Org. Dep Pess TB! Pl.e Org. Rot. Adm TA"),
                         "P. Org. Dep Pess TB / Pl.e Org. Rot. Adm TA")
        self.assertEqual(N.grupos_da_materia("Aplic Info TB / Dep Pessoal TA"), ["TA", "TB"])

    def test_reparo_do_marcador_so_no_padrao_inequivoco(self):
        self.assertEqual(N.reparar_marcador_final("Mecanismos Mecatrônicos TAB"), ("Mecanismos Mecatrônicos TA / TB", True))
        self.assertEqual(N.reparar_marcador_final("Tec. de Práticas Construtivas TA mB")[1], True)
        # NÃO mexe quando já há dois marcadores ou um TB em outro lugar
        self.assertEqual(N.reparar_marcador_final("Aplic Info TB / Dep Pessoal TA"), ("Aplic Info TB / Dep Pessoal TA", False))
        self.assertEqual(N.reparar_marcador_final("Estudos de Solos TA / TB")[1], False)

    def test_romanos_e_barra(self):
        self.assertEqual(N.normalizar_materia("Redes de Dados ll TA / TB"), "Redes de Dados II TA / TB")
        self.assertEqual(N.normalizar_materia("Apl. Mobile | TA / TB"), "Apl. Mobile I TA / TB")

    def test_texto_suspeito(self):
        self.assertTrue(N.texto_suspeito("M es"))
        self.assertTrue(N.texto_suspeito("Projetos Tec. da nformação"))
        self.assertFalse(N.texto_suspeito("Estudos de Matemática e Física"))

    def test_professores(self):
        self.assertEqual(N.separar_professores("FABIO ZANATTO , SERGIO EDUARDO"), ["FABIO ZANATTO", "SERGIO EDUARDO"])
        self.assertTrue(N.eh_placeholder("SUBS_Inglês"))
        self.assertTrue(N.eh_placeholder("SEM_PROF ADM"))
        self.assertFalse(N.eh_placeholder("Joice Nicola"))
        self.assertEqual(N.formatar_nome("RINALDO DOS SANTOS"), "Rinaldo dos Santos")
        self.assertEqual(N.chave_nome("NÍDIA  Vieira"), "NIDIA VIEIRA")

    def test_acentos_preservados(self):
        self.assertEqual(N.formatar_nome("GIOVANNA MACHADO, NÍDIA"), "Giovanna Machado, Nídia")
        self.assertEqual(N.normalizar_materia("Ações Estratégicas de Marketing"), "Ações Estratégicas de Marketing")


class TestConsenso(unittest.TestCase):
    def test_nao_funde_romanos_nem_grupos_trocados(self):
        c = Counter({"Banco de Dados II TA / TB": 4, "Banco de Dados I - TA / TB": 3,
                     "P. Org. Dep Pess TA / Apl Inf TB": 5, "P. Org. Dep Pess TB / Apl Inf TA": 4})
        mapa, _ = K.agrupar(c, 0.92, 2, 2.0, usar_assinatura=True, sim_forte=0.95)
        self.assertTrue(all(k == v for k, v in mapa.items()), mapa)

    def test_corrige_variante_rara_de_ocr(self):
        c = Counter({"Matemática": 12, "Matemáti": 1})
        mapa, _ = K.agrupar(c, 0.92, 2, 2.0, usar_assinatura=True)
        self.assertEqual(mapa["Matemáti"], "Matemática")

    def test_grade_vota_entre_paginas_e_so_corrige_confusoes_conhecidas(self):
        r = K.reconciliar_grade({1: ["19:00 19:50"], 2: ["19:00 19:50"], 3: ["19:00 19:50"], 4: ["49:00 19:50"]})
        self.assertEqual(r[4][0][:2], (1140, 1190))
        self.assertIn(r[4][0][2][0], ("HORARIO_CORRIGIDO_PELA_GRADE",))
        # diferença REAL (não é confusão de dígitos): não corrige, sinaliza
        r = K.reconciliar_grade({1: ["19:00 19:50"], 2: ["19:00 19:50"], 3: ["19:00 19:50"], 4: ["20:30 21:20"]})
        self.assertEqual(r[4][0][:2], (1230, 1280))
        self.assertEqual(r[4][0][2], ["HORARIO_DIVERGE_DA_GRADE"])

    def test_rotulo_cortado_a_esquerda(self):
        r = K.reconciliar_grade({1: ["21:00 21:50"], 2: ["21:00 21:50"], 3: ["21:00 21:50"], 4: ["4:00 4:50"]})
        self.assertEqual(r[4][0][:2], (1260, 1310))

    def test_contexto_unico_ou_nada(self):
        # '17:40 18:00' tem duração 20 min: só se repara pelo contexto, com solução ÚNICA
        self.assertEqual(K.reparar_por_contexto("17:40 18:00", 980, 50), (1030, 1080))
        # sem solução única/plausível: devolve None em vez de chutar
        self.assertIsNone(K.reparar_por_contexto("xx", 980, 50))
        self.assertIsNone(K.reparar_por_contexto("99:99 99:99", None, 50))

    def test_sem_leitura_valida_nao_inventa_horario(self):
        r = K.reconciliar_grade({1: ["xx"], 2: ["yy"]})
        self.assertIsNone(r[1][0])


class TestValidacao(unittest.TestCase):
    def _turma(self, aulas):
        return {"pagina": 1, "titulo_original": "1º X", "aulas": aulas}

    def _aula(self, dia="segunda", ini="19:00", fim="19:50", materia="Mat"):
        return {"dia_semana": dia, "hora_inicio": ini, "hora_fim": fim, "materia": materia, "professores": [], "alertas": []}

    def test_duplicada_e_horario_invalido(self):
        al = V.validar_aulas_da_turma(self._turma([self._aula(), self._aula(), self._aula(ini="20:00", fim="19:00")]))
        codigos = {a["codigo"] for a in al}
        self.assertIn("AULA_DUPLICADA", codigos)
        self.assertIn("HORARIO_INVALIDO", codigos)

    def test_materia_ausente(self):
        self.assertIn("MATERIA_AUSENTE", {a["codigo"] for a in V.validar_aulas_da_turma(self._turma([self._aula(materia="")]))})

    def test_professor_em_duas_turmas_ao_mesmo_tempo(self):
        a1, a2 = self._aula(), self._aula()
        a1["professores"] = a2["professores"] = ["Ana Silva"]
        t1, t2 = self._turma([a1]), self._turma([a2])
        t2["titulo_original"] = "2º Y"
        self.assertEqual(V.conflitos_de_professores([t1, t2])[0]["codigo"], "PROFESSOR_EM_DUAS_TURMAS")

    def test_nome_parcial_e_turma_duplicada(self):
        self.assertEqual(V.nomes_parciais(["Marcia Regina", "Marcia Regina Zugliani"])[0]["codigo"], "POSSIVEL_MESMO_PROFESSOR")
        t = {"pagina": 1, "nome": "Adm", "ano": 1, "titulo_original": "1º Adm"}
        self.assertEqual(V.turmas_duplicadas([t, {**t, "pagina": 2}])[0]["codigo"], "TURMA_DUPLICADA_NO_PDF")


if __name__ == "__main__":
    unittest.main()


class TestProfessoresOficiais(unittest.TestCase):
    LISTA = ["Janaina Frasson", "Sergio Cevallos", "Sergio Eduardo", "Marcia Regina Zugliani",
             "Nídia Vieira", "Rogério Vieira", "Jeniffer Silvério"]

    def casar(self, lido):
        from horarios_pdf.oficiais import casar_oficial
        return casar_oficial(N.chave_nome(lido), self.LISTA)

    def test_corrige_erro_de_ocr_e_espaco(self):
        self.assertEqual(self.casar("JANAINA FRA SSON"), "Janaina Frasson")
        self.assertEqual(self.casar("JANAINA FRASON"), "Janaina Frasson")
        self.assertEqual(self.casar("JENNIFER SILVERIO"), "Jeniffer Silvério")
        self.assertEqual(self.casar("NIDIA VIEIRA"), "Nídia Vieira")

    def test_nome_parcial_so_com_um_candidato(self):
        self.assertEqual(self.casar("MARCIA REGINA"), "Marcia Regina Zugliani")

    def test_nao_troca_pessoas_diferentes(self):
        self.assertIsNone(self.casar("SERGIO"))                # 1 palavra: ambíguo, não adivinha
        self.assertIsNone(self.casar("SERGIO MARTINS"))        # sobrenome diferente
        self.assertIsNone(self.casar("ROBERTA POLONIO"))       # não está na lista
        self.assertEqual(self.casar("SERGIO CEVALLOS"), "Sergio Cevallos")
        self.assertEqual(self.casar("SERGIO EDUARDO"), "Sergio Eduardo")

    def test_gabarito_aceita_variacao_e_nao_chuta_ambiguidade(self):
        from horarios_pdf.oficiais import casar_oficial_detalhe
        gabarito = [{"nome_oficial": "Nídia Vieira", "variacoes": ["Nidia V.", "Nidia Vieira"]}]
        self.assertEqual(casar_oficial_detalhe("NIDIA  V.", gabarito)["nome_oficial"], "Nídia Vieira")
        self.assertIsNone(casar_oficial_detalhe("Nidia Viera", [
            {"nome_oficial": "Nídia Vieira", "variacoes": ["Nidia Viera"]},
            {"nome_oficial": "Nadia Vieira", "variacoes": ["Nidia Viera"]},
        ]))

    def test_lista_vazia_ou_arquivo_ausente(self):
        from horarios_pdf.oficiais import carregar_professores, casar_oficial
        self.assertEqual(carregar_professores("/nao/existe.txt"), [])
        self.assertIsNone(casar_oficial("JANAINA FRASSON", []))

    def test_le_arquivo_com_comentarios_e_repetidos(self):
        import tempfile
        from horarios_pdf.oficiais import carregar_professores
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write("# comentário\n\nAna  Silva\nANA SILVA\nJoão Souza\n")
        try:
            self.assertEqual(carregar_professores(f.name), ["Ana Silva", "João Souza"])
        finally:
            os.unlink(f.name)


class TestMateriasOficiais(unittest.TestCase):
    LISTA = ["Estudos de Solos", "Banco de Dados I", "Banco de Dados II", "Ética e Cidadania Organizacional",
             "Planej. e Org. Rotinas Administrativas", "EACHSA", "EAMT", "P. Org. Dep Pess", "Apl Inf",
             "Artes", "Física", "Ed. Física"]

    def ajustar(self, texto):
        from horarios_pdf.oficiais import ajustar_materia
        return ajustar_materia(N.normalizar_materia(texto), self.LISTA)

    def test_corrige_erro_de_leitura_e_mantem_marcador(self):
        self.assertEqual(self.ajustar("Estudos de Soios TA /TB"), "Estudos de Solos TA / TB")
        self.assertEqual(self.ajustar("Ética e Cidadania Organizacilnal"), "Ética e Cidadania Organizacional")
        self.assertEqual(self.ajustar("Planej. e Org. Rotinas Administrativas - TA / TB"),
                         "Planej. e Org. Rotinas Administrativas - TA / TB")

    def test_numero_romano_nunca_e_trocado(self):
        self.assertEqual(self.ajustar("Banco de Dados II TA/TB"), "Banco de Dados II TA / TB")
        self.assertEqual(self.ajustar("Banco de Dadas I"), "Banco de Dados I")
        self.assertIsNone(self.ajustar("Banco de Dados III"))          # III não existe na lista
        self.assertIsNone(self.ajustar("Banco de Dados"))              # sem número: ambíguo

    def test_celula_com_duas_disciplinas(self):
        self.assertEqual(self.ajustar("P. Org. Dep Pess TA/ Apl Inf TB"), "P. Org. Dep Pess TA / Apl Inf TB")
        self.assertEqual(self.ajustar("EACHSA- TB / EAMT -TA"), "EACHSA- TB / EAMT -TA")

    def test_nomes_curtos_so_idênticos_e_sem_chute(self):
        self.assertEqual(self.ajustar("Artes"), "Artes")
        self.assertIsNone(self.ajustar("Arte"))                       # curto demais para fuzzy
        self.assertEqual(self.ajustar("Ed. Física"), "Ed. Física")
        self.assertEqual(self.ajustar("Fisica"), "Física")
        self.assertIsNone(self.ajustar("Geografia"))                  # fora da lista: não mexe

    def test_gabarito_usa_variacoes_normalizadas_e_preserva_grupo(self):
        from horarios_pdf.oficiais import ajustar_materia
        entidades = [{"nome_oficial": "Ética e Cidadania Organizacional", "variacoes": ["Etica Cid. Organizacilnal"]}]
        self.assertEqual(ajustar_materia("ETICA CID. ORGANIZACILNAL TA / TB", entidades),
                         "Ética e Cidadania Organizacional TA / TB")
        self.assertIsNone(ajustar_materia("Geografia TA", entidades, exigir_todas=True))

    def test_variacao_confirmada_corrige_texto_cortado_somente_por_match_exato(self):
        from horarios_pdf.oficiais import ajustar_materia
        from horarios_pdf.normalizacao import reparar_marcador_final
        entidades = [{"nome_oficial": "Projetos de Tecnologia da Informação",
                      "variacoes": ["TIVjTIVS UM Tecnologia da Informação"]}]
        texto, reparou = reparar_marcador_final("TIVjTIVS UM Tecnologia da Informação TA /")
        self.assertTrue(reparou)
        self.assertEqual(ajustar_materia(texto, entidades, exigir_todas=True, exigir_exato=True),
                         "Projetos de Tecnologia da Informação TA / TB")
        texto_inventado = "TIVjTIVS X Tecnologia da Informação TA / TB"
        self.assertIsNone(ajustar_materia(texto_inventado, entidades, exigir_todas=True, exigir_exato=True))

    def test_arquivo_ausente_e_leitura(self):
        import tempfile
        from horarios_pdf.oficiais import carregar_materias
        self.assertEqual(carregar_materias("/nao/existe.txt"), [])
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write("# c\n\nBanco de Dados I\nBanco de Dados II\nBANCO DE DADOS I\n")
        try:
            self.assertEqual(carregar_materias(f.name), ["Banco de Dados I", "Banco de Dados II"])
        finally:
            os.unlink(f.name)
