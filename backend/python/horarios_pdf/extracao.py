"""PDF -> imagens por página -> grade de células.

Só usa pdfplumber (já é dependência do projeto) para tirar a imagem NATIVA
embutida na página (sem reamostrar) e OpenCV para achar as células.
Nada do conteúdo do PDF é executado; ele é apenas lido.
"""
from dataclasses import dataclass, field

import cv2
import numpy as np
import pdfplumber

from . import config as C
from .erros import ErroLeituraPDF


@dataclass
class Celula:
    linha: int
    coluna: int
    x: int
    y: int
    w: int
    h: int
    tipo: str = "aula"          # aula | bloqueado | vazio
    imagem: np.ndarray = field(default=None, repr=False)


@dataclass
class PaginaGrade:
    numero: int                  # 1-based
    imagem: np.ndarray = field(repr=False)
    celulas: list = field(default_factory=list)
    linhas_y: list = field(default_factory=list)   # y do topo de cada linha
    x_primeira_coluna: int = 0
    colunas_x: list = field(default_factory=list)
    n_linhas: int = 0
    n_colunas: int = 0


# ---------------------------------------------------------------- PDF -> imagens
def _imagem_da_pagina(pagina):
    """Maior imagem embutida na página, em BGR. None se não houver."""
    if not pagina.images:
        return None
    img = max(pagina.images, key=lambda i: (i["x1"] - i["x0"]) * (i["bottom"] - i["top"]))
    w, h = img["srcsize"]
    if w * h > C.MAX_PIXELS_IMAGEM:
        raise ErroLeituraPDF("Imagem da página grande demais para ser processada.", "IMAGEM_GRANDE_DEMAIS")
    dados = img["stream"].get_data()
    esperado = w * h * 3
    if len(dados) == esperado and img.get("bits") == 8:
        return np.frombuffer(dados, np.uint8).reshape(h, w, 3)[:, :, ::-1].copy()
    # JPEG (DCTDecode) e outros formatos: deixa o OpenCV decodificar
    arr = cv2.imdecode(np.frombuffer(dados, np.uint8), cv2.IMREAD_COLOR)
    return arr


def abrir_paginas(caminho_pdf):
    """Gera (numero, total, imagem_bgr, tem_texto). Levanta ErroLeituraPDF se inválido."""
    try:
        pdf = pdfplumber.open(caminho_pdf)
    except Exception as exc:                      # PDF corrompido, criptografado...
        raise ErroLeituraPDF("O arquivo não pôde ser aberto como PDF (corrompido ou protegido).",
                             "PDF_CORROMPIDO") from exc
    try:
        if len(pdf.pages) == 0:
            raise ErroLeituraPDF("O PDF não tem páginas.", "PDF_VAZIO")
        if len(pdf.pages) > C.MAX_PAGINAS:
            raise ErroLeituraPDF(f"O PDF tem páginas demais (máximo {C.MAX_PAGINAS}).", "PDF_PAGINAS_DEMAIS")
        for i, pagina in enumerate(pdf.pages, start=1):
            try:
                tem_texto = len(pagina.chars) >= C.MIN_CHARS_PAGINA_COM_TEXTO
                imagem = _imagem_da_pagina(pagina)
                if imagem is None and not tem_texto:
                    imagem = _renderizar(pagina)      # vetor sem texto: tenta rasterizar
            except ErroLeituraPDF:
                raise
            except Exception as exc:
                raise ErroLeituraPDF(f"Falha ao ler a página {i} do PDF.", "PAGINA_ILEGIVEL") from exc
            yield i, len(pdf.pages), imagem, tem_texto
    finally:
        pdf.close()


def _renderizar(pagina, resolucao=200):
    pil = pagina.to_image(resolution=resolucao).original.convert("RGB")
    return np.asarray(pil)[:, :, ::-1].copy()


# --------------------------------------------------------------- grade de células
def _caixas_candidatas(imagem):
    img = imagem.copy()
    m = C.MARGEM_BORDA_PX
    img[:m] = img[-m:] = 255
    img[:, :m] = img[:, -m:] = 255
    mascara = (img.min(axis=2) < C.LIMIAR_FUNDO).astype(np.uint8) * 255
    mascara = cv2.morphologyEx(mascara, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contornos, _ = cv2.findContours(mascara, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    caixas = []
    for c in contornos:
        x, y, w, h = cv2.boundingRect(c)
        if C.CELULA_LARGURA[0] <= w <= C.CELULA_LARGURA[1] and C.CELULA_ALTURA[0] <= h <= C.CELULA_ALTURA[1]:
            caixas.append((x, y, w, h))
    return caixas


def _agrupar(valores, tolerancia):
    grupos = []
    for v in sorted(valores):
        if grupos and v - grupos[-1][-1] <= tolerancia:
            grupos[-1].append(v)
        else:
            grupos.append([v])
    return [int(round(sum(g) / len(g))) for g in grupos]


def classificar_celula(img_celula):
    """aula | bloqueado (hachurado) | vazio (cinza claro uniforme)."""
    h, w = img_celula.shape[:2]
    miolo = img_celula[3:h - 3, 3:w - 3]
    hsv = cv2.cvtColor(miolo, cv2.COLOR_BGR2HSV)
    sat = float(hsv[:, :, 1].mean())
    lum = miolo.astype(np.float32).mean(axis=2)
    if sat < 8 and 222 <= lum.mean() <= 248 and lum.std() < 6:
        return "vazio"
    if sat < 12:
        escuro = float(((lum >= 150) & (lum < 188)).mean())
        claro = float(((lum >= 190) & (lum < 220)).mean())
        if escuro >= 0.25 and claro >= 0.25 and lum.std() > 12:
            return "bloqueado"
    return "aula"


def detectar_grade(numero, imagem):
    """Acha as células e as organiza em linhas x colunas. None se não houver grade."""
    caixas = _caixas_candidatas(imagem)
    if not caixas:
        return None
    ys = _agrupar([b[1] for b in caixas], 10)
    xs = _agrupar([b[0] for b in caixas], 20)
    pagina = PaginaGrade(numero=numero, imagem=imagem, linhas_y=ys, colunas_x=xs,
                         n_linhas=len(ys), n_colunas=len(xs), x_primeira_coluna=min(xs))
    vistos = set()
    for (x, y, w, h) in caixas:
        li = min(range(len(ys)), key=lambda k: abs(ys[k] - y))
        co = min(range(len(xs)), key=lambda k: abs(xs[k] - x))
        if (li, co) in vistos:
            continue
        vistos.add((li, co))
        crop = imagem[y:y + h, x:x + w].copy()
        pagina.celulas.append(Celula(li, co, x, y, w, h, classificar_celula(crop), crop))
    pagina.celulas.sort(key=lambda c: (c.linha, c.coluna))
    return pagina


def recorte_titulo(pagina):
    """Faixa do título da turma (acima do cabeçalho dos dias). Devolve 2 variantes
    de recorte (o ícone ao lado do título às vezes é lido como dígito)."""
    y0 = min(pagina.linhas_y)
    img = pagina.imagem
    topo, base = max(0, y0 - 62), max(1, y0 - 30)
    return [img[topo:base, ini:min(img.shape[1], 900)] for ini in (20, 27)]


def recorte_cabecalho_coluna(pagina, coluna):
    y0 = min(pagina.linhas_y)
    x = pagina.colunas_x[coluna]
    return pagina.imagem[max(0, y0 - 36):max(1, y0 - 4), max(0, x - 6):x + 215]


def recorte_rotulo_linha(pagina, linha):
    y = pagina.linhas_y[linha]
    return pagina.imagem[y:y + 56, 0:max(1, pagina.x_primeira_coluna - 3)]
