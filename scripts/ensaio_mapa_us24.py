"""API HTTP de ensaio: dados sintéticos em SQLite descartável, sem Aiven."""
import argparse
from datetime import date, datetime, timedelta, timezone
from functools import partial
from http.server import ThreadingHTTPServer
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import threading
from uuid import NAMESPACE_URL, uuid5

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ['MYSQL_SSL_CA'] = ''
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--backend', type=Path, required=True, help='Checkout backend com US24-T02')
parser.add_argument('--porta-api', type=int, default=5000)
parser.add_argument('--porta-front', type=int, default=5173)
args = parser.parse_args()
backend = args.backend.resolve(strict=True)
frontend = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend))
from app import create_app, db
from app.exportacoes.csv import publicar_csv_indicadores
from app.models import (ArquivoArmazenado, ExecucaoProcessamento, IndicadorOperacional,
                        Linha, Parada, Trecho, VersaoGTFS)
from app.territorios.importacao import importar_limites_geojson
from app.territorios.associacao import associar_rede_a_territorios
from pyproj import Transformer
from sqlalchemy import event
from werkzeug.serving import make_server

UTC = timezone.utc
DIA = date(2026, 11, 24)
INICIO = datetime(2026, 11, 24, 11, tzinfo=UTC)
FIM = INICIO + timedelta(minutes=15)
VERSAO = '00000000-0000-0000-0000-000000000024'
uid = lambda nome: str(uuid5(NAMESPACE_URL, 'us24-ensaio:' + nome))

with tempfile.TemporaryDirectory(prefix='frontend-us10-us24-') as pasta:
    app = create_app({'TESTING': False, 'SQLALCHEMY_DATABASE_URI': 'sqlite:///' + (Path(pasta) / 'ensaio.sqlite').as_posix(),
                      'MYSQL_SSL_CA': None, 'EXPORTACOES_DIR': str(Path(pasta) / 'exportacoes'),
                      'INDICADORES_TRUSTED_PROXY_CIDRS': ''})
    with app.app_context():
        assert db.engine.dialect.name == 'sqlite'
        event.listen(db.engine, 'connect', lambda c, _: c.execute('PRAGMA foreign_keys=ON'))
        db.create_all()
        arquivo = ArquivoArmazenado(chave='controle/rede.zip', nome_original='rede-sintetica.zip',
            mime_type='application/zip', tamanho_bytes=0, sha256='a' * 64)
        versao = VersaoGTFS(id=VERSAO, hash='a' * 64, vigencia_inicio=date(2026, 1, 1), arquivo=arquivo)
        linha = Linha(versao_gtfs=versao, codigo='8000-10', nome='São José — linha SINTÉTICA')
        db.session.add_all([versao, linha])
        db.session.flush()
        para_m = Transformer.from_crs(4326, 31983, always_xy=True)
        para_g = Transformer.from_crs(31983, 4326, always_xy=True)
        x, y = para_m.transform(-46.63, -23.55)
        def retangulo(a, b):
            return {'type': 'Polygon', 'coordinates': [[[x+a, y-150], [x+b, y-150], [x+b, y+150], [x+a, y+150], [x+a, y-150]]]}
        subpref = {'type': 'FeatureCollection', 'features': []}
        distritos = {'type': 'FeatureCollection', 'features': []}
        for i, a, b in ((1, -600, 0), (2, 0, 300), (3, 300, 600)):
            subpref['features'].append({'type': 'Feature', 'geometry': retangulo(a, b), 'properties': {
                'cd_identificador_subprefeitura': i, 'cd_subprefeitura': str(i).zfill(2),
                'nm_subprefeitura': f'Subprefeitura controle {i:02}', 'dt_atualizacao': '2026-11-24T00:00:00Z'}})
        for i, a, b, s in ((1, -600, -300, 1), (2, -300, 0, 1), (3, 0, 300, 2), (4, 300, 600, 3)):
            distritos['features'].append({'type': 'Feature', 'geometry': retangulo(a, b), 'properties': {
                'cd_identificador_distrito': 100+i, 'cd_identificador_subprefeitura': s,
                'cd_distrito_municipal': str(i).zfill(2), 'nm_distrito_municipal': f'Distrito controle {i:02}',
                'dt_atualizacao': '2026-11-24T00:00:00Z'}})
        territorial = importar_limites_geojson(distritos, subpref)
        territorial.fonte = 'Limites SINTÉTICOS de ensaio US24; sem valor oficial'
        territorial.versao_fonte = 'controle-2026-11-24'
        referencias = {'PA': (-550, -20, 2, 5), 'PB': (-400, 20, 3, 10), 'P0': (-250, -20, 0, 10),
                      'P75': (-50, 20, 3, 4), 'P100': (50, -20, 1, 1), 'PN': (200, 20, 0, 0),
                      'P25': (-700, 0, 1, 4), 'P50': (-740, 40, 1, 2)}
        pontos = {}
        for codigo, (dx, dy, n, d) in referencias.items():
            lon, lat = para_g.transform(x+dx, y+dy)
            pontos[codigo] = (lon, lat)
            db.session.add(Parada(versao_gtfs_id=VERSAO, codigo=codigo, nome=f'Parada controle {codigo}', longitude=lon, latitude=lat))
        db.session.flush()
        trechos = [('T0', 'PA', 'PB', 1, 5), ('T1', 'PA', 'P75', 4, 5), ('T2', 'P0', 'P75', 0, 5), ('TN', 'P100', 'PN', 0, 0)]
        for i, (codigo, a, b, n, d) in enumerate(trechos, 1):
            db.session.add(Trecho(id=uid(codigo), versao_gtfs_id=VERSAO, linha_codigo='8000-10', sentido='0',
                trajeto=codigo, ordem=1, parada_origem_codigo=a, parada_destino_codigo=b, geometria=[list(pontos[a]), list(pontos[b])]))
        db.session.commit()
        associar_rede_a_territorios(VERSAO, territorial.id)
        def indicador(*, parada=None, trecho=None, tipo='PONTUALIDADE_VIAGENS', valor=None, n=None, d=None, unidade='%', sentido='0'):
            return IndicadorOperacional(id=uid(f'indicador:{parada}:{trecho}:{tipo}:{sentido}'), versao_gtfs_id=VERSAO, linha_codigo='8000-10', sentido=sentido,
                parada_codigo=parada, trecho_id=trecho, indicador=tipo, valor=valor, unidade=unidade,
                periodo_inicio=INICIO, periodo_fim=FIM, contagem_numerador=n, contagem_denominador=d,
                versao_conjunto='ensaio-us24-1', versao_correspondencia='correspondencia-controle', versao_calculo='regra-controle',
                qualidade={'origem': 'SINTETICA', 'dados_insuficientes': d == 0, 'versao_reconstrucao': 'recon-controle'})
        db.session.add(indicador(valor=87.5, n=7, d=8))
        for codigo, (_, _, n, d) in referencias.items():
            db.session.add(indicador(parada=codigo, valor=100*n/d if d else None, n=n, d=d))
        for codigo, _, _, n, d in trechos:
            db.session.add(indicador(trecho=uid(codigo), valor=100*n/d if d else None, n=n, d=d))
        for tipo, n in (('FREQUENCIA_OBSERVADA', 1), ('FREQUENCIA_PROGRAMADA', 2)):
            db.session.add(indicador(parada='P0', tipo=tipo, valor=n/0.25, n=n, unidade='passagens/h'))
        for tipo, valor in (('ESPERA_ESTIMADA', 4), ('EXCESSO_ESPERA', -1)):
            db.session.add(indicador(parada='P0', tipo=tipo, valor=valor, n=None, d=None, unidade='min'))
        # Um sentido diferente, que não pode contaminar o filtro ida.
        db.session.add(indicador(parada='P0', valor=100, n=1, d=1, sentido='1'))
        db.session.add(ExecucaoProcessamento(chave_logica='US23-T03:CONSOLIDACAO_DIA:2026-11-24',
            tipo='CONSOLIDACAO_DIA', estado='PRONTO', periodo_inicio=datetime(2026,11,24,3,tzinfo=UTC),
            periodo_fim=datetime(2026,11,25,3,tzinfo=UTC), bruto_id_maximo=0, versao_base='controle',
            versao_codigo='controle', versao_regra='controle', tentativas=1, parametros={},
            criada_em=INICIO, iniciada_em=INICIO, finalizada_em=datetime(2026,11,25,7,tzinfo=UTC)))
        db.session.commit()
        publicar_csv_indicadores(DIA, datetime(2026,11,25,7,tzinfo=UTC))
    spec = importlib.util.spec_from_file_location('frontend_servidor_qa', frontend/'servidor.py')
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    modulo.FrontendHandler.log_message = lambda *args: None
    api = make_server('127.0.0.1', args.porta_api, app, threaded=True)
    pagina = ThreadingHTTPServer(('127.0.0.1', args.porta_front), partial(modulo.FrontendHandler, directory=str(frontend)))
    threading.Thread(target=api.serve_forever, daemon=True).start()
    print(f'Ensaio SINTETICO: frontend {args.porta_front}; API SQLite descartavel {args.porta_api}. Ctrl+C encerra.', flush=True)
    try:
        pagina.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        pagina.server_close(); api.shutdown(); api.server_close()
        with app.app_context():
            db.session.remove()
            db.engine.dispose()
