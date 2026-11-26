# Uso (na pasta do backend): PYTHONPATH=. python <frontend>/scripts/backend_sintetico_us25_t03.py <pasta-temporaria> A|B|SERVIR
"""Backend local para validação visual: SQLite descartável, dados SINTÉTICOS. Nunca usa a Aiven."""
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from app import create_app, db
from app.indicadores.agenda import atualizar_indicadores, consolidar_dia
from app.models import (ArquivoArmazenado, ExecucaoColeta, ImportacaoProgramacao, LacunaColeta, Linha,
                        PartidaProgramada, VersaoGTFS, ViagemObservada)

UTC = timezone.utc
T0 = datetime(2026, 11, 24, 12, tzinfo=UTC)
pasta = Path(sys.argv[1]); fase = sys.argv[2]  # "A" ou "B"
banco = pasta / "visual.db"
app = create_app({"SQLALCHEMY_DATABASE_URI": f"sqlite:///{banco}", "MYSQL_SSL_CA": None,
                  "EXPORTACOES_DIR": str(pasta / "exportacoes")})
assert app.config["SQLALCHEMY_DATABASE_URI"].startswith("sqlite:///"), "somente SQLite"

def viagem(p, atraso):
    db.session.add(ViagemObservada(partida_programada=p, saida_observada=p.saida_prevista + timedelta(seconds=atraso),
                   cobertura_tracado=0.9, versao_reconstrucao="recon-1", versao_correspondencia="match-1"))
    db.session.commit()

with app.app_context():
    if fase == "A":
        db.drop_all(); db.create_all()
        arq = ArquivoArmazenado(chave="gtfs/t.zip", nome_original="t.zip", mime_type="application/zip", tamanho_bytes=0, sha256="a" * 64, criado_em=T0)
        v = VersaoGTFS(hash="a" * 64, capturada_em=T0, vigencia_inicio=date(2026, 1, 1), vigencia_fim=date(2026, 12, 31), arquivo=arq)
        linha = Linha(versao_gtfs=v, codigo="3762-10", nome="Linha sintética")
        db.session.add_all([v, linha]); db.session.flush()
        imp = ImportacaoProgramacao(versao_gtfs_id=v.id, linha=linha, data_operacao=date(2026, 11, 24), sentido="0", tipo_dia="UTIL",
              fonte="OFICIAL", versao_fonte="captura-1", fonte_url="https://example.invalid/grade", capturada_em=T0, verificada_em=T0, arquivo=arq)
        db.session.add(imp); db.session.flush()
        for i, m in enumerate((0, 15, 30), 1):
            db.session.add(PartidaProgramada(importacao=imp, ordem=i, saida_prevista=T0 + timedelta(minutes=m), tipo_oferta="FIXA", intervalo_seg=None))
        db.session.add(LacunaColeta(id="lac-1", inicio=T0 + timedelta(minutes=13), fim=T0 + timedelta(minutes=15), causa="SPTRANS_HTTP_503", fonte="OLHO_VIVO"))
        for base, falhas, ausentes in ((T0, range(26, 30), ()), (T0 + timedelta(minutes=15), (), (10, 11, 12))):
            for k in range(30):
                if k in ausentes: continue
                t = base + timedelta(seconds=30 * k)
                db.session.add(ExecucaoColeta(prevista_em=t, iniciada_em=t, finalizada_em=t + timedelta(seconds=1),
                               estado="FALHA" if k in falhas else "OK", erro="SPTRANS_HTTP_503" if k in falhas else None))
        db.session.commit()
        partidas = PartidaProgramada.query.order_by(PartidaProgramada.ordem).all()
        viagem(partidas[0], 30)
        atualizar_indicadores(T0 + timedelta(minutes=16)); atualizar_indicadores(T0 + timedelta(minutes=31))
    elif fase == "B":
        partidas = PartidaProgramada.query.order_by(PartidaProgramada.ordem).all()
        viagem(partidas[1], 40)
        atualizar_indicadores(T0 + timedelta(minutes=46))
        consolidar_dia(date(2026, 11, 24), agora=datetime(2026, 11, 25, 7, tzinfo=UTC))
    else:
        app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)
print("ok", fase)
