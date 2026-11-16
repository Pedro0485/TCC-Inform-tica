"""Testes do contrato da CLI (read_horarios_pdf.py) com PDFs reais e problemáticos.
O teste com o PDF real roda o OCR (~40 s)."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

AQUI = os.path.dirname(__file__)
CLI = os.path.join(AQUI, "..", "read_horarios_pdf.py")
TARDE = os.path.join(AQUI, "fixtures", "horario_tarde.pdf")


def rodar(caminho, env_extra=None):
    env = {**os.environ, **(env_extra or {})}
    p = subprocess.run([sys.executable, CLI, caminho], capture_output=True, env=env, timeout=280)
    return p.returncode, json.loads(p.stdout.decode("utf-8")), p.stderr.decode("utf-8", "replace")


def pdf_de_texto(texto):
    """PDF mínimo e válido com texto selecionável e nenhuma imagem."""
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    fluxo = f"BT /F1 12 Tf 10 100 Td ({texto}) Tj ET"
    objs[3] = f"<< /Length {len(fluxo)} >>\nstream\n{fluxo}\nendstream"
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += f"{i} 0 obj\n{o}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return out


class TestErros(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def _arq(self, nome, dados):
        p = os.path.join(self.tmp.name, nome)
        with open(p, "wb") as f:
            f.write(dados)
        return p

    def _erro(self, caminho, codigo, env=None):
        rc, r, _ = rodar(caminho, env)
        self.assertEqual(rc, 2)
        self.assertFalse(r["ok"])
        self.assertEqual(r["erro"]["codigo"], codigo)
        self.assertEqual(r["erro"]["etapa"], "leitura_pdf")
        return r

    def test_arquivo_inexistente(self):
        self._erro(os.path.join(self.tmp.name, "nao_existe.pdf"), "ARQUIVO_NAO_ENCONTRADO")

    def test_pdf_corrompido(self):
        self._erro(self._arq("ruim.pdf", b"%PDF-1.4\n1 0 obj << /Broken >>\nlixo sem fim"), "PDF_CORROMPIDO")

    def test_arquivo_que_nao_e_pdf(self):
        self._erro(self._arq("texto.pdf", "isto não é um PDF".encode()), "PDF_CORROMPIDO")

    def test_pdf_vazio(self):
        self._erro(self._arq("vazio.pdf", b""), "PDF_CORROMPIDO")

    def test_pdf_so_com_texto_selecionavel_nao_e_suportado(self):
        r = self._erro(self._arq("texto.pdf", pdf_de_texto("Segunda-feira Matematica 19:00 Professor Fulano de Tal da Silva Sauro")),
                       "GRADE_NAO_ENCONTRADA")
        self.assertNotIn("Fulano", json.dumps(r))      # mensagem de erro não vaza conteúdo

    def test_imagem_sem_grade(self):
        from PIL import Image
        p = os.path.join(self.tmp.name, "branco.pdf")
        Image.new("RGB", (1100, 400), "white").save(p)
        self._erro(p, "GRADE_NAO_ENCONTRADA")

    def test_pdf_com_paginas_demais(self):
        self._erro(TARDE, "PDF_PAGINAS_DEMAIS", {"HORARIOS_MAX_PAGINAS": "1"})


class TestPdfReal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rc, cls.r, cls.err = rodar(TARDE)
        cls.d = cls.r.get("dados", {})

    def test_contrato(self):
        self.assertEqual(self.rc, 0)
        self.assertTrue(self.r["ok"])
        self.assertEqual(self.d["versao_esquema"], 1)
        self.assertRegex(self.d["arquivo"]["sha256"], r"^[0-9a-f]{64}$")
        for chave in ("turmas", "professores", "correcoes", "alertas", "resumo"):
            self.assertIn(chave, self.d)

    def test_estrutura_do_documento(self):
        self.assertEqual([t["nome"] for t in self.d["turmas"]], ["MKT-T", "Des. Sistemas - T"])
        self.assertEqual([t["ano"] for t in self.d["turmas"]], [1, 2])
        self.assertTrue(all(t["turno_sugerido"] == "vespertino" for t in self.d["turmas"]))
        self.assertTrue(all(len(t["aulas"]) == 30 for t in self.d["turmas"]))   # 6 períodos x 5 dias
        self.assertEqual(self.d["resumo"]["alertas_erro"], 0)

    def test_horarios_da_grade_da_tarde(self):
        horas = sorted({a["hora_inicio"] + "-" + a["hora_fim"] for a in self.d["turmas"][0]["aulas"]})
        self.assertEqual(horas, ["12:40-13:30", "13:30-14:20", "14:20-15:10", "15:30-16:20", "16:20-17:10", "17:10-18:00"])

    def test_celulas_conferidas_visualmente(self):
        seg = {a["hora_inicio"]: a for a in self.d["turmas"][0]["aulas"] if a["dia_semana"] == "segunda"}
        self.assertEqual((seg["12:40"]["materia"], seg["12:40"]["professores"]), ("Geografia", ["Maria Ivone Chagas"]))
        self.assertEqual((seg["13:30"]["materia"], seg["13:30"]["professores"]), ("Matemática", ["Ana Sheila"]))
        self.assertEqual((seg["15:30"]["materia"], seg["15:30"]["professores"]), ("Inglês", ["Joice Nicola"]))
        sex = {a["hora_inicio"]: a for a in self.d["turmas"][0]["aulas"] if a["dia_semana"] == "sexta"}
        self.assertEqual((sex["12:40"]["materia"], sex["12:40"]["professores"]), ("Geografia", ["Maria Ivone Chagas"]))
        self.assertEqual(sex["16:20"]["materia"], "Ed. Física")

    def test_associacao_professor_aula_nao_se_mistura(self):
        # a mesma disciplina nunca aparece com um professor de outra: dupla de períodos idênticos
        for t in self.d["turmas"]:
            por_bloco = {}
            for a in t["aulas"]:
                por_bloco.setdefault((a["dia_semana"], a["materia"]), set()).add(tuple(a["professores"]))
            multi = {k: v for k, v in por_bloco.items() if len(v) > 1 and not any(m in k[1] for m in ("TA", "TB"))}
            self.assertEqual(multi, {}, f"mesma aula com professores diferentes: {multi}")

    def test_grupos_ta_tb_sao_preservados_nao_adivinhados(self):
        aulas = [a for t in self.d["turmas"] for a in t["aulas"] if len(a["professores"]) >= 2 and a["grupos"]]
        self.assertTrue(aulas)
        self.assertTrue(all("ASSOCIACAO_PROFESSOR_GRUPO_INDEFINIDA" in a["alertas"] for a in aulas))

    def test_acentos_preservados(self):
        todos = json.dumps(self.d, ensure_ascii=False)
        for palavra in ("Física", "Português", "Química", "Planejamento"):
            self.assertIn(palavra, todos)

    def test_progresso_e_log_sem_conteudo(self):
        self.assertIn("@@PROGRESSO", self.err)
        for conteudo in ("Matemática", "Geografia", "Maria Ivone", "Joice"):
            self.assertNotIn(conteudo, self.err, "o log técnico não deve conter texto do documento")


if __name__ == "__main__":
    unittest.main()
