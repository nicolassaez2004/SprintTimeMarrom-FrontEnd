"""Servidor local do Observa SP. Execute python servidor.py."""

import argparse
import socket
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


RAIZ = Path(__file__).resolve().parent
PAGINAS = {"/", "/index.html", "/qualidade.html", "/acervo.html", "/mapa.html", "/brutos.html", "/series.html"}
ASSETS = {
    "assets": {".svg", ".png", ".jpg", ".webp", ".ico"},
    "css": {".css"},
    "js": {".js", ".mjs"},
    "src": {".js", ".css"},
    "data": {".geojson", ".json"},  # linhas-sptrans.json alimenta o filtro do mapa
}


class FrontendHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript"}

    def send_head(self):
        caminho = unquote(urlsplit(self.path).path)
        partes = caminho.lstrip("/").split("/")
        eh_asset = (
            len(partes) >= 2
            and Path(partes[-1]).suffix in ASSETS.get(partes[0], ())
            and all(p and not p.startswith(".") and "\\" not in p and ":" not in p for p in partes)
            and (RAIZ.joinpath(*partes)).resolve().is_relative_to(RAIZ / partes[0])
        )
        if caminho not in PAGINAS and not eh_asset:
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        # Sem isto o navegador reutiliza JS/HTML antigos por heurística após atualizações.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None


class FrontendServer(ThreadingHTTPServer):
    allow_reuse_address = False
    allow_reuse_port = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    parser = argparse.ArgumentParser(description="Inicia o frontend local do Observa SP.")
    parser.add_argument("--sem-navegador", action="store_true", help="Não abrir o navegador automaticamente.")
    args = parser.parse_args()
    endereco = "http://127.0.0.1:5173/"
    handler = partial(FrontendHandler, directory=str(RAIZ))
    try:
        servidor = FrontendServer(("127.0.0.1", 5173), handler)
    except OSError:
        parser.exit(1, "Não foi possível usar a porta 5173. Encerre o servidor anterior com Ctrl+C.\n")
    with servidor:
        print(f"Observa SP disponível em {endereco}", flush=True)
        if not args.sem_navegador:
            try:
                abriu = webbrowser.open(endereco, new=2)
            except (OSError, webbrowser.Error):
                abriu = False
            if not abriu:
                print(f"Abra {endereco} no navegador.", flush=True)
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
