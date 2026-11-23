# SprintTimeMarrom

## US13-T03 — Qualidade dos dados

Mapa ao vivo, Qualidade da coleta e Acervo oficial são abas do Observa SP e usam o backend Flask.
Não contém credenciais nem substitui falhas por dados de demonstração.

1. Iniciar o backend configurado: `python app.py`, na pasta do backend.
2. Nesta pasta, executar `python servidor.py`.
3. O navegador abre em **http://127.0.0.1:5173/**. O mapa é a tela inicial. Use as abas para abrir **Acervo oficial** ou **Qualidade da coleta**.

O meta `api-base` em `index.html` aponta por padrão para
`http://127.0.0.1:5000/`. Em outra instalação, informar o endereço HTTP público
do backend e configurar a origem correspondente no CORS do Flask.
Não informar URL do MySQL, senha ou token no frontend.

### Conferir as falhas conhecidas sem banco da equipe

No backend: `python -m scripts.demonstrar_qualidade_us13`.
Manter o servidor estático do passo 2 e abrir:

http://127.0.0.1:5173/?inicio=2026-11-17&fim=2026-11-20#qualidade

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

## US22-T02 — Mapa público ao vivo

Abra a aba **Mapa ao vivo** na página inicial. A URL da API fica em `src/config.js`. O padrão de desenvolvimento é `http://127.0.0.1:5000`.

Consome `GET /posicoes/atuais` e `GET /posicoes/atuais?linha=<código Olho Vivo>`,
conforme o contrato da US22-T01. Usa Leaflet 1.9.4 e tiles do OpenStreetMap com
atribuição visível.

A navegação e os marcadores são limitados ao município de São Paulo pelo
polígono oficial (código IBGE 3550308), armazenado em
`data/municipio-sp-3550308.geojson`. O contorno aparece no mapa, sem máscara
opaca no entorno. Fonte: [API de Malhas Municipais do IBGE](https://servicodados.ibge.gov.br/api/v3/malhas/municipios/3550308?formato=application/vnd.geo+json&qualidade=maxima).


## US22-T03 — Atualização e defasagem

O mapa consulta novamente a API a cada 30 s sem recarregar a página. Uma nova
consulta aborta a anterior; respostas antigas são ignoradas mesmo se o servidor
terminar de enviá-las após o cancelamento. O tempo entre `coletado_em` e a
renderização do marcador é medido no navegador. Posições com até 60 s ficam em
verde; as mais antigas (ou sem horário de coleta) ficam em âmbar com um aviso,
e a falha temporária preserva os últimos marcadores válidos.

Verificações sintéticas, sem depender do Aiven/SPTrans: `node --test
 tests/mapa/atualizacao.test.mjs tests/qualidade.test.mjs`. Cobrem a medição da
defasagem, coleta antiga/horário inválido, resposta fora de ordem/cancelamento
e falha temporária. O teste não comprova disponibilidade real da fonte externa.
