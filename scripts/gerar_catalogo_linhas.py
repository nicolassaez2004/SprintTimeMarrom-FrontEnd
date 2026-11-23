"""Gera o catálogo do mapa a partir do GTFS e de capturas públicas Olho Vivo."""
import argparse
import csv
import hashlib
import io
import json
import re
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile


def ler_json(caminho):
    return json.loads(caminho.read_text(encoding="utf-8-sig"))


def gerar(gtfs, frota, cadastro):
    with ZipFile(gtfs) as arquivo:
        nome = next(n for n in arquivo.namelist() if Path(n).name.lower() == "routes.txt")
        with io.TextIOWrapper(arquivo.open(nome), encoding="utf-8-sig", errors="replace") as stream:
            rotas = list(csv.DictReader(stream))

    por_letreiro = defaultdict(list)
    for rota in rotas:
        por_letreiro[rota["route_short_name"]].append(rota)

    candidatos = defaultdict(set)
    frota = ler_json(frota)
    cadastro = ler_json(cadastro)
    for linha in frota["resposta"]["l"]:
        candidatos[f'{linha["cl"]}:{linha["sl"]}'].add(linha["c"])
    for linha in cadastro["linhas"]:
        candidatos[f'{linha["cl"]}:{linha["sl"]}'].add(f'{linha["lt"]}-{linha["tl"]}')

    linhas = {}
    codigos = {}
    for letreiro, grupo in sorted(por_letreiro.items()):
        if not letreiro:
            continue
        cores = {rota.get("route_color", "").upper() for rota in grupo}
        cor = next(iter(cores)) if len(cores) == 1 else ""
        linhas[letreiro] = "#" + cor if re.fullmatch(r"[0-9A-F]{6}", cor) else None
        for rota in grupo:
            codigos[rota["route_id"]] = letreiro

    return {
        "fontes": {
            "gtfs_sha256": hashlib.sha256(gtfs.read_bytes()).hexdigest(),
            "olho_vivo_frota_em": frota["recebida_em"],
            "olho_vivo_cadastro_em": cadastro["consultada_em"],
        },
        "linhas": linhas,
        "gtfs": codigos,
        "olho_vivo": {
            chave: letreiro
            for chave, opcoes in sorted(candidatos.items()) if len(opcoes) == 1
            for letreiro in opcoes if letreiro in linhas
        },
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for argumento in ("gtfs", "frota", "cadastro", "saida"):
        parser.add_argument(argumento, type=Path)
    args = parser.parse_args()
    catalogo = gerar(args.gtfs, args.frota, args.cadastro)
    args.saida.write_text(json.dumps(catalogo, ensure_ascii=False, separators=(",", ":")) + "\n",
                          encoding="utf-8")
