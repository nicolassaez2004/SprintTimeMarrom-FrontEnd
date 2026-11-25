# SprintTimeMarrom

## Mapa de indicadores (US24-T03)

Abra **Mapa de indicadores** no menu. A página pública consulta a API pronta
por parada, trecho, distrito ou subprefeitura e mantém filtros e versões no
endereço. Legenda com unidades e limites ajustáveis; zero e ausência são
distintos. [Uso, contrato e evidências](docs/US24-T03.md).

## CSV de indicadores (US10-T02-FE)

No histórico por linha, **Baixar indicadores em CSV** usa a rota pronta com
os filtros selecionados. Escolha um dia do período; arquivos não consolidados
aparecem como indisponíveis. [Uso, limites e evidências](docs/US10-T02-FE.md).

## Histórico por linha (US23-T02A / US23-T02B)

Abra `series.html` pelo menu **Histórico por linha**. Os filtros consultam o
backend `/series`, ficam no endereço e preservam zero e ausência de resultado.
[Filtros e consulta](docs/US23-T02A.md), [gráficos e evidências](docs/US23-T02B.md).
Os gráficos usam os resultados da mesma consulta, com unidades, zero e lacunas.
Requer US23-T01 no backend; a branch T02B inclui a T02A.

## Mapa ao vivo (US22)

`mapa.html` consulta `GET /posicoes/atuais` a cada 10 s. A API responde 304
quando não há ciclo novo. Posições com mais de 60 s de coleta ficam âmbar, e a
barra mostra a última coleta ("coleta atrasada" acima de 60 s). O filtro usa
`data/linhas-sptrans.json`, cuja chave é a mesma `codigo_olho_vivo:sentido_olho_vivo` da API.
Testes: `node --test tests/` e `python -m unittest tests/test_servidor.py`.

## US09-T02-FE — Dados brutos e dicionário

Página **`brutos.html`**, acessível por **Dados brutos** na navegação. Lista o
catálogo pronto da US09-T02, permite escolher o dia e baixar o Parquet e exibe
o dicionário. Inclui carregamento, erro, nova tentativa e indisponibilidade.
O arquivo é recebido do backend; não há geração no navegador.

Com o backend atualizado em `http://localhost:5000`, iniciar este frontend com
`python servidor.py` e abrir **Dados brutos** na navegação principal ou
`http://127.0.0.1:5173/brutos.html`. O endereço do backend de todas as páginas está em `js/comum/config.mjs`.

Testes: `node --test tests/brutos.test.mjs tests/acervo.test.mjs tests/qualidade.test.mjs tests/mapa/atualizacao.test.mjs`
(27 passaram). [Entrega, contrato, capturas e limites da verificação](docs/US09-T02-FE.md).

## US13-T03 — Qualidade dos dados

Mapa ao vivo, Qualidade da coleta e Acervo oficial são abas do Observa SP e usam o backend Flask.
Não contém credenciais nem substitui falhas por dados de demonstração.

1. No VS Code, abra `app.py` do backend configurado e clique em **Executar Arquivo Python**. A API e o coletor de ônibus sobem juntos.
2. Abra `servidor.py` do frontend e clique em **Executar Arquivo Python**. Mantenha os dois processos abertos.
3. O navegador abre em **http://127.0.0.1:5173/**. O mapa é a tela inicial. Use as abas para abrir **Acervo oficial** ou **Qualidade da coleta**.

`API_BASE` em `js/comum/config.mjs` aponta por padrão para
`http://127.0.0.1:5000/` e vale para todas as páginas. Em outra instalação, informar o endereço HTTP público
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

Abra a aba **Mapa ao vivo** na página inicial. A URL da API fica em `js/comum/config.mjs`. O padrão de desenvolvimento é `http://127.0.0.1:5000`.

Consome `GET /posicoes/atuais?modo=ultima_coleta` e aplica os filtros de
letreiro e cor sobre os dados recebidos. Usa Leaflet 1.9.4 e tiles do
OpenStreetMap com atribuição visível.

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

## Organização do código

Cada página tem uma pasta em `js/` com a mesma divisão de responsabilidades
(equivalente a `src/pages` e `src/api` do diagrama de componentes):

| Pasta | Conteúdo |
| --- | --- |
| `js/comum/` | `config.mjs` (endereço do backend), `http.mjs` (consulta com tempo limite e erros legíveis), `formatacao.mjs` (datas e números no horário de São Paulo) |
| `js/<página>/app.mjs` | Tela: eventos, estados de carregamento/erro e renderização |
| `js/<página>/cliente.mjs` | Chamadas HTTP ao backend |
| `js/<página>/modelo.mjs` | Validação do contrato da API e regras de exibição |

Páginas: `mapa`, `qualidade`, `acervo`, `brutos`, `series` e `mapa-indicadores`; estilos em `css/`.
