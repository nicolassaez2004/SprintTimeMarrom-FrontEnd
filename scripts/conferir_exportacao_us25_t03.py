# Uso: python scripts/conferir_exportacao_us25_t03.py <pasta-temporaria> <pasta-do-backend>
# Requer selenium + Firefox, frontend em :5173 e scripts/backend_sintetico_us25_t03.py servindo em :5000.
"""Ensaio no Firefox (Selenium): painel A → exportação → publicação B → arquivo A. Dados SINTÉTICOS."""
import json, subprocess, sys, time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait

S = Path(sys.argv[1]); BACK = Path(sys.argv[2]); DL = S / "downloads"; SHOTS = S / "shots"
URL = "http://127.0.0.1:5173/series.html?linha=3762-10&sentido=0&tipo=PONTUALIDADE_VIAGENS&inicio=2026-11-24&fim=2026-11-24"
op = Options(); op.add_argument("-headless")
for k, v in {"browser.download.folderList": 2, "browser.download.dir": str(DL), "browser.download.useDownloadDir": True,
             "browser.helperApps.neverAsk.saveToDisk": "text/csv,image/svg+xml", "browser.download.always_ask_before_handling_new_types": False}.items():
    op.set_preference(k, v)
d = webdriver.Firefox(options=op); d.set_window_size(1280, 2400)
ev = {}
espera = WebDriverWait(d, 30)
txt = lambda i: d.find_element(By.ID, i).text
GANCHO = """
window.__downloads = []; window.__liberar = false; window.__pedidos = [];
const original = window.fetch.bind(window);
window.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('downloads/indicadores')) { window.__pedidos.push(u); while (!window.__liberar) await new Promise(r => setTimeout(r, 100)); }
  return original(url, init);
};
const criar = URL.createObjectURL.bind(URL);
URL.createObjectURL = blob => { blob.text().then(t => window.__downloads.push({ tipo: blob.type, texto: t })); return criar(blob); };
"""
try:
    d.get(URL); t0 = time.time()
    espera.until(lambda x: x.find_element(By.ID, "resultado-series").is_displayed())
    d.execute_script(GANCHO)
    ev["A_versao_tela"] = txt("versao-painel"); ev["A_linhas_tabela"] = len(d.find_elements(By.CSS_SELECTOR, "#valores-series tr"))
    ev["A_avisos_tabela"] = [e.text for e in d.find_elements(By.CSS_SELECTOR, "#valores-series .aviso-qualidade-linha")]
    d.save_screenshot(str(SHOTS / "1-painel-versao-A.png"))
    d.find_element(By.CSS_SELECTOR, ".exportar-grafico").click(); time.sleep(1)  # imagem do estado A
    d.find_element(By.ID, "baixar-painel-csv").click(); time.sleep(1)
    ev["status_durante"] = txt("status-painel-csv"); ev["pedido_csv"] = d.execute_script("return window.__pedidos")
    subprocess.run([str(BACK / ".venv/bin/python"), str(Path(__file__).with_name("backend_sintetico_us25_t03.py")), str(S), "B"],
                   cwd=BACK, env={"PYTHONPATH": "."}, check=True)                          # publica B
    WebDriverWait(d, 120).until(lambda x: ev["A_versao_tela"] != txt("versao-painel"))   # atualização própria do painel
    ev["segundos_ate_atualizar"] = round(time.time() - t0); ev["B_versao_tela"] = txt("versao-painel")
    ev["B_linhas_tabela"] = len(d.find_elements(By.CSS_SELECTOR, "#valores-series tr"))
    d.execute_script("window.__liberar = true")
    WebDriverWait(d, 30).until(lambda x: not txt("status-painel-csv").startswith("Gerando"))
    time.sleep(1)
    ev["status_final"] = txt("status-painel-csv")
    ev["downloads_capturados"] = [{"tipo": x["tipo"], "inicio": x["texto"][:160]} for x in d.execute_script("return window.__downloads")]
    (S / "shots/csv-capturado.csv").write_text(next(x["texto"] for x in d.execute_script("return window.__downloads") if x["tipo"].startswith("text/csv")))
    (S / "shots/svg-A.svg").write_text(next(x["texto"] for x in d.execute_script("return window.__downloads") if x["tipo"].startswith("image/svg")))
    d.save_screenshot(str(SHOTS / "2-painel-B-apos-exportar-A.png"))
    ev["avisos_grafico_B"] = [e.text for e in d.find_elements(By.CSS_SELECTOR, ".avisos-qualidade-grafico li")][:4]
    # Falha: conjunto da versão B removido → 410, nenhum arquivo.
    antes = len(d.execute_script("return window.__downloads"))
    for f in (S / "exportacoes/indicadores/conjuntos").glob("*"):
        if ev["B_versao_tela"].split(": ")[1].split(" ")[0] in f.name: f.unlink()
    d.find_element(By.ID, "baixar-painel-csv").click()
    WebDriverWait(d, 30).until(lambda x: "Nenhum arquivo" in txt("status-painel-csv"))
    ev["status_falha"] = txt("status-painel-csv"); ev["downloads_apos_falha"] = len(d.execute_script("return window.__downloads")) - antes
    d.save_screenshot(str(SHOTS / "3-falha-410.png"))
    d.set_window_size(390, 2400); time.sleep(1.5); d.save_screenshot(str(SHOTS / "4-mobile-B.png"))
    ev["overflow_horizontal_390"] = d.execute_script("return document.documentElement.scrollWidth > window.innerWidth")
finally:
    ev["origem"] = "SINTETICA: Flask local + SQLite descartável, Firefox headless (Selenium)"; (SHOTS / "navegador.json").write_text(json.dumps(ev, ensure_ascii=False, indent=1)); print(json.dumps(ev, ensure_ascii=False)[:300]); d.quit()
