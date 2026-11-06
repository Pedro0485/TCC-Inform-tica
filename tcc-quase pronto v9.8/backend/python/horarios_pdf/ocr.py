"""OCR das regiões da grade (Tesseract via pytesseract).

Decisões calibradas com os PDFs reais (veja README):
  * texto branco sobre cor: NÃO binarizar. Manter tons de cinza (anti-aliasing)
    reduziu o erro dos nomes de ~6% para <1% por caractere.
  * rodapé (professores) tem ~6 px de altura: amplia 3-6x e vota entre variantes.
"""
import difflib
import os
import re
from collections import Counter

import cv2
import numpy as np

# 1 thread por processo do Tesseract: paralelizamos por células, não dentro do OCR
os.environ.setdefault("OMP_THREAD_LIMIT", "1")

import pytesseract  # noqa: E402

from . import config as C  # noqa: E402
from .erros import ErroOCR  # noqa: E402
from .normalizacao import limpar_espacos, parse_rotulo  # noqa: E402

_PASTA_TESSDATA_PROJETO = os.path.join(os.path.dirname(__file__), "..", "tessdata")
_verificado = False


def verificar_tesseract():
    """Garante binário + idioma. Mensagem acionável se faltar algo."""
    global _verificado
    if _verificado:
        return
    pasta = os.getenv("HORARIOS_TESSDATA_DIR")
    if not pasta and os.path.exists(os.path.join(_PASTA_TESSDATA_PROJETO, f"{C.IDIOMA_OCR}.traineddata")):
        pasta = os.path.abspath(_PASTA_TESSDATA_PROJETO)
    if pasta:
        os.environ["TESSDATA_PREFIX"] = pasta
    # Windows: o instalador do Tesseract não o coloca no PATH. HORARIOS_TESSERACT_CMD ou o caminho padrão.
    cmd = os.getenv("HORARIOS_TESSERACT_CMD")
    if not cmd and os.name == "nt":
        for cand in (r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe", r"C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe"):
            if os.path.exists(cand):
                cmd = cand
                break
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
    try:
        idiomas = pytesseract.get_languages(config="")
    except Exception as exc:
        raise ErroOCR("Tesseract não encontrado no servidor. Instale o programa 'tesseract-ocr'.",
                      "TESSERACT_AUSENTE") from exc
    if C.IDIOMA_OCR not in idiomas:
        raise ErroOCR(f"Idioma '{C.IDIOMA_OCR}' do Tesseract não instalado (pacote tesseract-ocr-{C.IDIOMA_OCR}).",
                      "TESSERACT_SEM_IDIOMA")
    _verificado = True


# ------------------------------------------------------------------ utilitários
def _cinza_relativo(regiao_bgr, fundo=None, ganho=None):
    """Realça texto MAIS CLARO que o fundo da região, preservando anti-aliasing.
    Retorna (imagem_uint8 onde texto=claro, mascara_texto_bool)."""
    lum = regiao_bgr.astype(np.float32).mean(axis=2)
    bg = float(np.median(lum)) if fundo is None else fundo
    if ganho is None:
        # ganho adaptativo: branco puro sempre vira ~235, qualquer que seja a cor do
        # fundo (fundos claros têm pouco contraste com o texto branco)
        ganho = 235.0 / max(255.0 - bg, 25.0)
    realce = np.clip((lum - bg) * ganho, 0, 255).astype(np.uint8)
    return realce, (lum - bg) > 60


def _preparar(realce, escala, interp):
    grande = cv2.resize(realce, None, fx=escala, fy=escala, interpolation=interp)
    grande = 255 - grande                                   # texto escuro, fundo branco
    return cv2.copyMakeBorder(grande, 24, 24, 24, 24, cv2.BORDER_CONSTANT, value=255)


def _tesseract_texto(imagem, psm, extra=""):
    verificar_tesseract()
    cfg = f"--psm {psm} {extra}".strip()
    return pytesseract.image_to_string(imagem, lang=C.IDIOMA_OCR, config=cfg)


def _tesseract_dados(imagem, psm):
    verificar_tesseract()
    d = pytesseract.image_to_data(imagem, lang=C.IDIOMA_OCR, config=f"--psm {psm}",
                                  output_type=pytesseract.Output.DICT)
    linhas, confs = {}, []
    for i, txt in enumerate(d["text"]):
        txt = txt.strip()
        if not txt:
            continue
        chave = (d["block_num"][i], d["par_num"][i], d["line_num"][i])
        linhas.setdefault(chave, []).append(txt)
        c = float(d["conf"][i])
        if c >= 0:
            confs.append(c)
    texto = " ".join(" ".join(p) for _, p in sorted(linhas.items()))
    return texto, (sum(confs) / len(confs) / 100.0 if confs else 0.0)


def altura_rodape(celula_bgr):
    """Altura (px) da faixa do rodapé, medida pela mudança de cor numa coluna sem texto.
    Padrão = 14; cartões com muitos professores têm rodapé de 2 linhas (~22 px)."""
    h = celula_bgr.shape[0]
    col = celula_bgr[:, 8:14].astype(np.float32).mean(axis=(1, 2))
    ref = col[h - 2]                         # última linha útil (a última é a borda clara)
    n = 0
    for i in range(h - 2, -1, -1):
        if abs(col[i] - ref) >= 2.5:
            break
        n += 1
    if 12 <= n <= 15:                        # 13/14 px = jitter de arredondamento dos prints
        return C.ALTURA_RODAPE
    return n if 16 <= n <= 32 else C.ALTURA_RODAPE


# -------------------------------------------------------------------- regiões
def ocr_titulo(recortes):
    """Lê o título tentando as variantes de recorte; devolve a lista de textos."""
    saidas = []
    for r in recortes:
        cinza = cv2.cvtColor(r, cv2.COLOR_BGR2GRAY)
        grande = cv2.resize(cinza, None, fx=3, fy=3, interpolation=cv2.INTER_LANCZOS4)
        grande = cv2.copyMakeBorder(grande, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
        saidas.append(limpar_espacos(_tesseract_texto(grande, 7)))
    return saidas


def ocr_cabecalho_dia(recorte):
    cinza = cv2.cvtColor(recorte, cv2.COLOR_BGR2GRAY)
    grande = cv2.resize(cinza, None, fx=3, fy=3, interpolation=cv2.INTER_LANCZOS4)
    grande = cv2.copyMakeBorder(grande, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
    return limpar_espacos(_tesseract_texto(grande, 7))


def ocr_rotulo_horario(recorte):
    """Rótulo '19:00 / 19:50' da coluna esquerda (texto cinza-escuro, ~8 px).
    Tenta escalas diferentes e devolve a primeira leitura que seja um horário VÁLIDO;
    se nenhuma for, devolve a primeira leitura bruta (o consenso trata depois)."""
    cinza = cv2.cvtColor(recorte, cv2.COLOR_BGR2GRAY).astype(np.float32)
    bg = float(np.median(cinza))
    realce = np.clip(255 - (bg - cinza) * 3.0, 0, 255).astype(np.uint8)
    primeira = None
    for escala, interp in ((4, cv2.INTER_LANCZOS4), (5, cv2.INTER_CUBIC),
                           (3, cv2.INTER_LINEAR), (6, cv2.INTER_LANCZOS4)):
        grande = cv2.resize(realce, None, fx=escala, fy=escala, interpolation=interp)
        grande = cv2.copyMakeBorder(grande, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
        txt = " ".join(_tesseract_texto(grande, 6, "-c tessedit_char_whitelist=0123456789:").split())
        primeira = primeira or txt
        if parse_rotulo(txt, C.DURACAO_AULA_MIN):
            return txt
    return primeira or ""


def ocr_corpo(celula_bgr):
    """Nome da disciplina. Devolve (texto, confianca 0-1, cortado_na_origem)."""
    h, w = celula_bgr.shape[:2]
    corpo = celula_bgr[0:h - altura_rodape(celula_bgr) - 1, :].copy()
    fundo_bgr = np.median(corpo.reshape(-1, 3), axis=0)
    corpo[0:C.LOCK_ALTURA, w - C.LOCK_LARGURA:w] = fundo_bgr          # apaga o cadeado
    realce, mascara = _cinza_relativo(corpo)
    # linha 0 é a borda arredondada da célula (não é texto). Texto cortado na origem
    # 'cola' nas linhas 1-2 do topo ou nas 3 últimas da base (calibrado nos PDFs reais).
    cortado = bool(mascara[1:3].sum() >= 10 or mascara[-3:].sum() >= 12)
    # A borda arredondada da célula vira uma "moldura" preta na imagem de OCR e,
    # com uma só palavra, o Tesseract a toma pelo conteúdo. Recorta a margem.
    util = realce[3:, 3:w - 3]
    candidatos = []
    for escala, interp in _VARIANTES_CORPO:
        texto, conf = _tesseract_dados(_preparar(util, escala, interp), 6)
        candidatos.append((limpar_espacos(texto), conf))
        # Duas leituras independentes iguais bastam. Confiança média alta de UMA leitura
        # não basta: ela esconde erros locais (ex.: o '/TB' final).
        if len(candidatos) == 2 and _forma(candidatos[0][0]) == _forma(candidatos[1][0]):
            break
    texto, conf = _escolher_medoide(candidatos)
    return texto, conf, cortado


_VARIANTES_CORPO = [(3, cv2.INTER_LINEAR), (3, cv2.INTER_CUBIC),
                    (4, cv2.INTER_LINEAR), (2, cv2.INTER_CUBIC)]


def _forma(t):
    return re.sub(r"[\s/|]+", "", t.lower())


def _escolher_medoide(candidatos):
    """Entre leituras diferentes da MESMA imagem, fica com a mais parecida com as
    demais (o erro do OCR é errático; o acerto tende a se repetir)."""
    if len(candidatos) == 1:
        return candidatos[0]
    melhor, melhor_pontos = candidatos[0], -1.0
    for i, (t, c) in enumerate(candidatos):
        pontos = sum(difflib.SequenceMatcher(None, _forma(t), _forma(u)).ratio()
                     for j, (u, _) in enumerate(candidatos) if j != i) + c * 0.1
        if pontos > melhor_pontos:
            melhor, melhor_pontos = (t, c), pontos
    return melhor


_VARIANTES_RODAPE = [(4, cv2.INTER_LANCZOS4), (5, cv2.INTER_CUBIC), (3, cv2.INTER_LANCZOS4),
                     (6, cv2.INTER_CUBIC), (4, cv2.INTER_CUBIC)]


def _normaliza_voto(txt):
    t = re.sub(r"[|\[\]{}]", " ", txt.upper())
    t = re.sub(r"\s*,\s*", ", ", t)
    return limpar_espacos(t)


def ocr_rodape(celula_bgr):
    """Nomes dos professores. Vota entre variantes até haver maioria clara.
    Devolve (texto, concordancia 0-1)."""
    h, w = celula_bgr.shape[:2]
    fh = altura_rodape(celula_bgr)
    faixa = celula_bgr[h - fh:h - 1, 7:w - 4]
    psm = 7 if fh <= 18 else 6               # 2 linhas: segmentação em bloco
    realce, _ = _cinza_relativo(faixa)
    votos = Counter()
    rodadas = 0
    for escala, interp in _VARIANTES_RODAPE:
        txt = _normaliza_voto(_tesseract_texto(_preparar(realce, escala, interp), psm))
        rodadas += 1
        if txt:
            votos[txt] += 1
        top = votos.most_common(2)
        if rodadas >= 2 and top and top[0][1] >= 2 and (len(top) == 1 or top[0][1] > top[1][1]):
            break
    if not votos:
        return "", 0.0
    texto, n = votos.most_common(1)[0]
    return texto, n / rodadas
