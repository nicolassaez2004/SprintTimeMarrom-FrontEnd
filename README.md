# SprintTimeMarrom

## US13-T03 — Qualidade dos dados

Página pública em **`qualidade.html`**, consumindo o backend Flask real.
Não contém credenciais nem substitui falhas por dados de demonstração.

1. Iniciar o backend configurado: `python app.py`, na pasta do backend.
2. Nesta pasta, executar `python -m http.server 5173 --bind 127.0.0.1`.
3. Abrir **http://127.0.0.1:5173/qualidade.html**.

O meta `api-base` em `qualidade.html` aponta por padrão para
`http://127.0.0.1:5000/`. Em outra instalação, informar o endereço HTTP público
do backend e configurar a origem correspondente no CORS do Flask.
Não informar URL do MySQL, senha ou token no frontend.

### Conferir as falhas conhecidas sem banco da equipe

No backend: `python -m scripts.demonstrar_qualidade_us13`.
Manter o servidor estático do passo 2 e abrir:

http://127.0.0.1:5173/qualidade.html?inicio=2026-11-17&fim=2026-11-20

O aviso **Cenário de teste** identifica os dados sintéticos. Em 18 e 19/11,
conferir a mesma falha atravessando meia-noite e a troca GTFS A → B. Em 20/11,
ver o dia inteiro sem dados e a ambiguidade B/C. Em 17/11, percentual desconhecido.
Os passos completos estão em `docs/US13-T03.md` do backend.

Neste computador, o ambiente isolado já preparado fica em
`../SprintTimeMarrom-BackEnd/instance/us13/venv/Scripts/python.exe`; ele também
pode substituir `python` ao iniciar este servidor estático.

### Testes e evidências

Com Node 20+: `node --test tests/qualidade.test.mjs` (8 testes, sem npm install).
Regenerar o fixture pelo backend:

```powershell
python -m scripts.demonstrar_qualidade_us13 --fixture ../SprintTimeMarrom-FrontEnd/tests/fixtures/qualidade-us13.json
```

Capturas conferidas em `docs/evidencias/qualidade-desktop.jpg`,
`qualidade-mobile.jpg` e `qualidade-indisponivel.jpg`.
A página segue a identidade do protótipo `origin/exemplo`, mas ficou separada
dos seus arquivos para reduzir conflitos e não apresentar seus dados fictícios
como dados reais. A main do frontend só possuía README antes desta tarefa.
