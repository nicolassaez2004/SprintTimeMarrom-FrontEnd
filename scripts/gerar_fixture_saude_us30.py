"""US30-T03B: grava respostas reais de GET /saude (US30-T03A) como fixture do frontend.

Dados SINTÉTICOS em SQLite temporário (sem MySQL nem dados da equipe). Executar a
partir da raiz do backend:
    python <frontend>/scripts/gerar_fixture_saude_us30.py <frontend>/tests/fixtures/saude-us30.json

Cenários:
- ``parcial``: novembro/2026 consultado em 10/11 16:00 UTC. API com 4 minutos de
  falha (15:20–15:22 e a última, 15:59), PAINEL sempre OK, COLETA com lacuna ABERTA desde 15:40.
- ``encerrado``: fevereiro/2026 (mês encerrado, 40 320 minutos). API com 100 minutos
  de falha (meta atendida: limite inferior ≥ 99%), PAINEL com 500 minutos de falha
  (meta não atendida: limite superior < 99%), COLETA sem nenhum ciclo (meta indefinida).
- ``sem_sondagem``: outubro/2026 sem nenhum registro (tudo lacuna de monitoramento).
- ``erro_400`` e ``erro_503``: mês inválido e banco indisponível.
"""
import json
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from app import create_app, db
from app.models import ExecucaoColeta, LacunaColeta, VerificacaoSaude

UTC = timezone.utc
M = timedelta(minutes=1)


def sondas(componente, inicio, minutos, falhas=()):
    for i in range(minutos):
        instante = inicio + i * M + timedelta(seconds=5)
        ok = i not in falhas
        yield {"id": f"{componente}-{instante:%Y%m%d%H%M}", "componente": componente, "verificada_em": instante,
               "estado": "OK" if ok else "INDISPONIVEL", "latencia_ms": 90 if ok else 15000,
               "status_http": 200 if ok else 503, "detalhe": "OK" if ok else "HTTP_ERRO",
               "alvo": "GET /saude" if componente == "API" else "GET /index.html"}


def consultar(app, mes, agora):
    with mock.patch("app.api.saude.agora_utc", return_value=agora):
        resposta = app.test_client().get("/saude", query_string={"mes": mes})
    return {"status": resposta.status_code, "corpo": resposta.get_json()}


def main(destino):
    pasta = Path(tempfile.mkdtemp(prefix="us30-t03b-"))
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{pasta / 'db.sqlite'}",
                      "MYSQL_SSL_CA": None, "INDICADORES_TRUSTED_PROXY_CIDRS": ""})
    with app.app_context():
        db.create_all()
        # Parcial: 10/11/2026 15:00–15:59 UTC.
        t0 = datetime(2026, 11, 10, 15, tzinfo=UTC)
        db.session.bulk_insert_mappings(VerificacaoSaude, list(sondas("API", t0, 60, falhas={20, 21, 22, 59})))
        db.session.bulk_insert_mappings(VerificacaoSaude, list(sondas("PAINEL", t0, 60)))
        db.session.add(LacunaColeta(id="lacuna-aberta", inicio=t0 + 40 * M, fim=None,
                                    causa="SPTRANS_HTTP_503", fonte="OLHO_VIVO"))
        db.session.add(LacunaColeta(id="lacuna-encerrada", inicio=t0 + 5 * M, fim=t0 + 7 * M,
                                    causa="SPTransTimeoutError", fonte="OLHO_VIVO"))
        for n in range(120):
            instante = t0 + n * timedelta(seconds=30)
            falhou = n >= 80
            db.session.add(ExecucaoColeta(fonte="OLHO_VIVO", prevista_em=instante, iniciada_em=instante,
                                          estado="FALHA" if falhou else "OK", recebidos=0 if falhou else 10,
                                          erro="SPTRANS_HTTP_503" if falhou else None,
                                          lacuna_id="lacuna-aberta" if falhou else None))
        # Encerrado: fevereiro/2026 inteiro (28 dias).
        f0 = datetime(2026, 2, 1, 3, tzinfo=UTC)  # 00:00 em São Paulo
        minutos = 28 * 24 * 60
        db.session.bulk_insert_mappings(VerificacaoSaude, list(sondas("API", f0, minutos, set(range(1000, 1100)))))
        db.session.bulk_insert_mappings(VerificacaoSaude, list(sondas("PAINEL", f0, minutos, set(range(5000, 5500)))))
        db.session.commit()

    saida = {
        "origem": "GET /saude do backend (US30-T03A), SQLite temporário, dados SINTÉTICOS",
        "parcial": consultar(app, "2026-11", datetime(2026, 11, 10, 16, tzinfo=UTC)),
        "encerrado": consultar(app, "2026-02", datetime(2026, 11, 27, 12, tzinfo=UTC)),
        "sem_sondagem": consultar(app, "2026-10", datetime(2026, 11, 27, 12, tzinfo=UTC)),
        "erro_400": consultar(app, "2026-13", datetime(2026, 11, 27, 12, tzinfo=UTC)),
    }
    from sqlalchemy.exc import OperationalError

    with mock.patch("app.api.saude.consultar_saude", side_effect=OperationalError("x", {}, Exception("y"))):
        saida["erro_503"] = consultar(app, "2026-11", datetime(2026, 11, 27, 12, tzinfo=UTC))
    Path(destino).write_text(json.dumps(saida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1])
