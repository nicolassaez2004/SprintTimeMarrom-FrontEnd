"""Servidor local do frontend: catálogo do filtro de linhas é servido; o resto, não."""
import threading
import unittest
import urllib.error
import urllib.request
from functools import partial

import servidor


class ServidorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = partial(servidor.FrontendHandler, directory=str(servidor.RAIZ))
        handler.log_message = lambda *args: None
        cls.http = servidor.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.http.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()

    def status(self, caminho):
        try:
            with urllib.request.urlopen(self.base + caminho) as resposta:
                return resposta.status
        except urllib.error.HTTPError as erro:
            return erro.code

    def test_catalogo_e_limite_do_mapa_sao_servidos(self):
        self.assertEqual(self.status("/data/linhas-sptrans.json"), 200)
        self.assertEqual(self.status("/data/municipio-sp-3550308.geojson"), 200)

    def test_arquivos_sao_revalidados_apos_atualizacao(self):
        with urllib.request.urlopen(self.base + "/js/mapa/app.mjs") as resposta:
            self.assertEqual(resposta.headers["Cache-Control"], "no-cache")

    def test_arquivos_fora_da_lista_continuam_bloqueados(self):
        for caminho in ("/servidor.py", "/data/../servidor.py", "/data/inexistente.json", "/.git/config"):
            with self.subTest(caminho=caminho):
                self.assertEqual(self.status(caminho), 404)


if __name__ == "__main__":
    unittest.main()
