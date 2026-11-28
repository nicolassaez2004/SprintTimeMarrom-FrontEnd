"""US21-T04-FE: grava respostas reais de GET /relatorios/associacoes (US21-T04) como fixture.

Reaproveita o ensaio CONTROLADO do backend (``tests/api/test_relatorios_associacoes_us21.py``):
base sintética, plano e revisão FICTÍCIOS. Não é publicação real. Executar na raiz do backend:
    PYTHONPATH=. python <frontend>/scripts/gerar_fixture_relatorio_us21.py <frontend>/tests/fixtures/relatorio-us21.json
"""
import json
import runpy
import sys
from pathlib import Path
from unittest import mock

from sqlalchemy.exc import OperationalError

from app import create_app, db
from app.relatorios.associacoes import registrar_invalido, registrar_publicado

RAIZ = Path.cwd()


def resposta(cliente, mes):
    r = cliente.get("/api/relatorios/associacoes", query_string={"mes": mes})
    return {"status": r.status_code, "corpo": r.get_json()}


def main(destino):
    ensaio = runpy.run_path(str(RAIZ / "tests/api/test_relatorios_associacoes_us21.py"))["ensaio"].__wrapped__
    resultado, bases, revisao = ensaio()
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "MYSQL_SSL_CA": None})
    with app.app_context():
        db.create_all()
        registrar_publicado("2025-01", resultado, bases, revisao)
        registrar_invalido("2025-03", "MATRIZ_SEM_POSTO_COMPLETO")
        db.session.commit()
    cliente = app.test_client()
    saida = {
        "aviso": "Ensaio controlado do backend: base sintética, plano e revisão FICTÍCIOS; não é publicação real.",
        "publicado": resposta(cliente, "2025-01"),
        "nao_encontrado": resposta(cliente, "2025-02"),
        "invalido": resposta(cliente, "2025-03"),
        "erro_400": resposta(cliente, "2025-13"),
    }
    with mock.patch("app.api.relatorios.consultar", side_effect=OperationalError("x", {}, Exception("y"))):
        saida["erro_503"] = resposta(cliente, "2025-01")
    Path(destino).write_text(json.dumps(saida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1])
