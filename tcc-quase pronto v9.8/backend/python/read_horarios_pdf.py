#!/usr/bin/env python3
"""Entrada de linha de comando do leitor de horários.

Uso:   python read_horarios_pdf.py <caminho.pdf>

Contrato com o Node (api/services/importacaoHorarios/pythonRunner.js):
  * stdout: UM documento JSON, sempre.
        sucesso -> {"ok": true,  "dados": {...}}
        falha   -> {"ok": false, "erro": {"etapa", "codigo", "mensagem"}}
  * stderr: linhas "@@PROGRESSO {json}" (andamento) e logs técnicos. Nenhum log
    contém texto lido do documento (só contagens e códigos).
  * código de saída: 0 ok | 2 erro tratado | 1 erro inesperado.
O caminho é recebido como argumento (nunca por shell) e o PDF só é LIDO, nunca executado.
"""
import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))



def _saida(obj):
    sys.stdout.buffer.write(json.dumps(obj, ensure_ascii=False).encode("utf-8"))
    sys.stdout.flush()


try:
    from horarios_pdf.erros import ErroHorarios, ErroLeituraPDF  # noqa: E402
    from horarios_pdf.pipeline import processar_pdf  # noqa: E402
except ModuleNotFoundError as _exc:
    # Biblioteca não instalada: devolve um erro EXPLICATIVO em JSON (e não um traceback mudo).
    _saida({"ok": False, "erro": {"etapa": "leitura_pdf", "codigo": "DEPENDENCIA_AUSENTE",
            "mensagem": f"Falta instalar a biblioteca Python '{(_exc.name or '?').split('.')[0]}'. "
                        "Rode: python -m pip install -r backend/python/requirements.txt"}})
    sys.exit(2)


def _progresso(etapa, pct, mensagem):
    print("@@PROGRESSO " + json.dumps({"etapa": etapa, "pct": pct, "mensagem": mensagem},
                                      ensure_ascii=False), file=sys.stderr, flush=True)


def main(argv):
    if len(argv) != 2:
        _saida({"ok": False, "erro": {"etapa": "leitura_pdf", "codigo": "USO_INVALIDO",
                                       "mensagem": "Informe o caminho do PDF."}})
        return 2
    caminho = argv[1]
    try:
        if not os.path.isfile(caminho):
            raise ErroLeituraPDF("Arquivo não encontrado.", "ARQUIVO_NAO_ENCONTRADO")
        _saida({"ok": True, "dados": processar_pdf(caminho, _progresso)})
        return 0
    except ErroHorarios as exc:
        _saida({"ok": False, "erro": exc.como_dict()})
        return 2
    except Exception:  # noqa: BLE001 - qualquer outra falha vira erro genérico
        traceback.print_exc(file=sys.stderr)
        _saida({"ok": False, "erro": {"etapa": "leitura_pdf", "codigo": "ERRO_INESPERADO",
                                       "mensagem": "Falha inesperada ao processar o PDF."}})
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
