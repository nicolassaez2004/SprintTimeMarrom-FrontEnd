"""US28-T03B: grava respostas reais da API de extrações (US28-T03A) como fixture do frontend.

Executar a partir da raiz do backend (SQLite temporário, sem MySQL nem dados da equipe):
    python <frontend>/scripts/gerar_fixture_extracoes_us28.py <frontend>/tests/fixtures/extracoes-us28.json
"""
import json
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app import create_app, db
from app.exportacoes.extracoes import ExportService, executor_extracao
from app.jobs import JobService
from app.models import ExecucaoColeta, PedidoExtracao, RegistroBrutoGPS

INICIO = datetime(2026, 11, 1, 3, tzinfo=timezone.utc)
CORPO = {"linha": "33887", "inicio": "2026-11-01T00:00:00-03:00",
         "fim": "2026-11-08T00:00:00-03:00", "formato": "CSV"}


def main(destino):
    pasta = Path(tempfile.mkdtemp(prefix="us28-t03b-"))
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{pasta / 'db.sqlite'}",
                      "EXPORTACOES_DIR": str(pasta / "exportacoes")})
    cliente, saida = app.test_client(), {}
    with app.app_context():
        db.create_all()
        ciclo = ExecucaoColeta(iniciada_em=INICIO - timedelta(days=1))
        db.session.add(ciclo)
        db.session.flush()
        db.session.add_all(RegistroBrutoGPS(execucao_id=ciclo.id, linha_origem="33887",
                                            coletado_em=INICIO + timedelta(hours=h)) for h in range(5))
        db.session.commit()

    post = cliente.post("/api/extracoes", json=CORPO)
    pedido_id = post.get_json()["id"]
    saida["solicitacao_202"] = {"status": post.status_code, "corpo": post.get_json()}
    saida["aguardando"] = cliente.get(f"/api/extracoes/{pedido_id}").get_json()

    original = ExportService._progresso

    def espiar(self, job_id, token, registros):
        original(self, job_id, token, registros)
        saida.setdefault("processando", cliente.get(f"/api/extracoes/{pedido_id}").get_json())
    ExportService._progresso = espiar
    executor_extracao(app, ExportService(tamanho_lote=2)).executar_um()
    ExportService._progresso = original
    saida["pronto"] = cliente.get(f"/api/extracoes/{pedido_id}").get_json()

    outro = cliente.post("/api/extracoes", json={**CORPO, "formato": "PARQUET"}).get_json()["id"]
    with app.app_context():
        job = db.session.get(PedidoExtracao, outro).execucao
        job.estado, job.tentativas, job.erro = "ERRO", JobService.LIMITE_TENTATIVAS, "OperationalError"
        db.session.commit()
    saida["erro"] = cliente.get(f"/api/extracoes/{outro}").get_json()

    inexistente = cliente.get("/api/extracoes/00000000-0000-0000-0000-000000000000")
    saida["nao_encontrado_404"] = {"status": inexistente.status_code, "corpo": inexistente.get_json()}
    invalido = cliente.post("/api/extracoes", json={**CORPO, "linha": "abc"})
    saida["pedido_invalido_400"] = {"status": invalido.status_code, "corpo": invalido.get_json()}

    saida["_origem"] = "Respostas reais do Flask test client do backend (branch feat/us28-t03a-consulta-estado), SQLite temporário."
    Path(destino).write_text(json.dumps(saida, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1])
