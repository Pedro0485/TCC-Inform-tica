"""
read_pdf.py

Le um arquivo de horarios (PDF) salvo pelo Node em backend/uploads/horarios/,
tenta extrair as aulas (dia da semana, hora inicio, hora fim, materia) e manda
o resultado como JSON para o Node salvar no banco, na rota:

    POST /turmas/horarios-lidos

Uso:
    python read_pdf.py <caminho_do_pdf> <turma_id>

Exemplo:
    python read_pdf.py "../uploads/horarios/1785600000000-1A_Info.pdf" 1

O Node deve chamar este script via child_process depois que o upload terminar,
passando o caminho do arquivo salvo e o id da turma correspondente.

IMPORTANTE: a extracao abaixo e "melhor esforco" — ela tenta ler tabelas do PDF
e, se nao achar nenhuma, cai para uma extracao por regex em cima do texto puro.
O layout real do PDF de horarios do projeto ainda nao foi visto por quem gerou
este script, entao é bem provavel que a funcao `extrair_aulas_da_tabela` e/ou
`extrair_aulas_do_texto` precisem de ajuste para bater com o formato exato do
arquivo usado na escola. Ajuste essas duas funcoes conforme o PDF real.
"""

import sys
import os
import re
import json

import pdfplumber
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

NODE_API_URL = os.environ.get('NODE_API_URL', 'http://localhost:3000')
INTERNAL_KEY = os.environ.get('PYTHON_INTERNAL_KEY')

DIAS_VALIDOS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']

# Mapeia variações de escrita do dia da semana pro valor que o banco espera
ALIAS_DIAS = {
    'segunda': 'segunda', 'segunda-feira': 'segunda', 'seg': 'segunda',
    'terca': 'terca', 'terça': 'terca', 'terca-feira': 'terca', 'terça-feira': 'terca', 'ter': 'terca',
    'quarta': 'quarta', 'quarta-feira': 'quarta', 'qua': 'quarta',
    'quinta': 'quinta', 'quinta-feira': 'quinta', 'qui': 'quinta',
    'sexta': 'sexta', 'sexta-feira': 'sexta', 'sex': 'sexta',
    'sabado': 'sabado', 'sábado': 'sabado', 'sab': 'sabado',
}

# Ex: "07:00" ou "07:00:00" ou "07h00"
REGEX_HORA = re.compile(r'(\d{1,2})[:h](\d{2})')


def normalizar_dia(valor):
    chave = str(valor).strip().lower()
    return ALIAS_DIAS.get(chave)


def normalizar_hora(valor):
    m = REGEX_HORA.search(str(valor))
    if not m:
        return None
    return f'{int(m.group(1)):02d}:{m.group(2)}'


def extrair_aulas_da_tabela(pdf, turma_id):
    """
    Tenta ler o PDF como uma grade/tabela: colunas = dias da semana,
    linhas = horarios, celulas = materia.
    Espera um cabecalho com os dias da semana na primeira linha da tabela.
    """
    aulas = []

    for page in pdf.pages:
        tabelas = page.extract_tables()
        for tabela in tabelas:
            if not tabela or len(tabela) < 2:
                continue

            cabecalho = tabela[0]
            colunas_dias = {}
            for idx, celula in enumerate(cabecalho):
                dia = normalizar_dia(celula) if celula else None
                if dia:
                    colunas_dias[idx] = dia

            if not colunas_dias:
                continue  # essa tabela nao parece ser uma grade de horarios

            for linha in tabela[1:]:
                if not linha or not linha[0]:
                    continue

                # primeira coluna normalmente e o horario, ex: "07:00 - 07:50"
                horas = REGEX_HORA.findall(linha[0])
                if len(horas) < 2:
                    continue

                hora_inicio = f'{int(horas[0][0]):02d}:{horas[0][1]}'
                hora_fim = f'{int(horas[1][0]):02d}:{horas[1][1]}'

                for idx, dia in colunas_dias.items():
                    if idx >= len(linha):
                        continue
                    materia = (linha[idx] or '').strip()
                    if not materia or materia.lower() in ('—', '-', 'nenhuma', '— nenhuma —'):
                        continue

                    aulas.append({
                        'turma_id': turma_id,
                        'dia_semana': dia,
                        'hora_inicio': hora_inicio,
                        'hora_fim': hora_fim,
                        'materia': materia,
                    })

    return aulas


def extrair_aulas_do_texto(pdf, turma_id):
    """
    Fallback: procura linhas soltas no texto no formato
    "Segunda 07:00 07:50 Matemática" (dia, hora inicio, hora fim, materia).
    Ajuste a regex conforme o formato real do PDF.
    """
    aulas = []
    padrao = re.compile(
        r'(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado)'
        r'[^\d]{0,10}(\d{1,2}[:h]\d{2})[^\d]{0,10}(\d{1,2}[:h]\d{2})\s+([^\n]+)',
        re.IGNORECASE
    )

    for page in pdf.pages:
        texto = page.extract_text() or ''
        for match in padrao.finditer(texto):
            dia_raw, hi_raw, hf_raw, materia_raw = match.groups()
            dia = normalizar_dia(dia_raw)
            hora_inicio = normalizar_hora(hi_raw)
            hora_fim = normalizar_hora(hf_raw)
            materia = materia_raw.strip()

            if not (dia and hora_inicio and hora_fim and materia):
                continue

            aulas.append({
                'turma_id': turma_id,
                'dia_semana': dia,
                'hora_inicio': hora_inicio,
                'hora_fim': hora_fim,
                'materia': materia,
            })

    return aulas


def ler_pdf(caminho_pdf, turma_id):
    with pdfplumber.open(caminho_pdf) as pdf:
        aulas = extrair_aulas_da_tabela(pdf, turma_id)
        if not aulas:
            aulas = extrair_aulas_do_texto(pdf, turma_id)
    return aulas


def enviar_para_node(aulas):
    if not INTERNAL_KEY:
        raise RuntimeError('PYTHON_INTERNAL_KEY não configurada no .env do backend')

    resp = requests.post(
        f'{NODE_API_URL}/turmas/horarios-lidos',
        json=aulas,
        headers={'x-internal-key': INTERNAL_KEY},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    if len(sys.argv) < 3:
        print('Uso: python read_pdf.py <caminho_do_pdf> <turma_id>', file=sys.stderr)
        sys.exit(1)

    caminho_pdf = sys.argv[1]
    turma_id = int(sys.argv[2])

    if not os.path.isfile(caminho_pdf):
        print(json.dumps({'erro': f'Arquivo não encontrado: {caminho_pdf}'}))
        sys.exit(1)

    try:
        aulas = ler_pdf(caminho_pdf, turma_id)

        if not aulas:
            print(json.dumps({'erro': 'Nenhuma aula encontrada no PDF', 'aulas': []}))
            sys.exit(1)

        resultado = enviar_para_node(aulas)
        print(json.dumps({'ok': True, 'total_aulas': len(aulas), 'resposta_node': resultado}))

    except Exception as exc:
        print(json.dumps({'erro': str(exc)}))
        sys.exit(1)


if __name__ == '__main__':
    main()