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
