# Revisão US25-T03, US26-T02-FE e US26-T03-FE (26/11/2026)

Branch `review/us06-us25-us26` (a partir de `main` 54c0b94). Sem commit. Todos os dados
abaixo são **SINTÉTICOS**: backend Flask real (rotas e serviços da `main` do backend) sobre
SQLite descartável; nada foi lido ou escrito na Aiven.

## Defeitos encontrados e corrigidos

| P | Defeito | Correção |
|---|---|---|
| P0 | O painel esperava `versao_dados` como texto; a API (US25-T01) envia objeto `{id, tipo, publicada_em…}`. Com a API real, `fixarPainel` lançava erro e **o histórico inteiro deixava de renderizar** (os testes usavam um texto fictício). | `fixarPainel` lê o objeto; versão ausente ou malformada só bloqueia a exportação, nunca a leitura do painel. |
| P1 | O CSV do painel era gerado no navegador: duplicava o mecanismo da US25-T01, só tinha a página visível e não trazia contagens nem `qualidade_coleta`. | O botão chama `GET /downloads/indicadores?versao_dados=<id>` com os mesmos filtros de `/series` e o período efetivo (`consulta.inicio/fim`). Só entrega o arquivo se `Content-Type`, `X-Versao-Dados` e `X-Total-Registros` (= `paginacao.total`; ×2 na espera) conferem. 404/410 → “versão não pode mais ser exportada”, sem arquivo. |
| P1 | Imagem SVG: o gráfico era esticado para 350 px (`preserveAspectRatio="none"`), achatando os avisos quando havia muitos. | Altura proporcional ao `viewBox`; avisos longos são quebrados em linhas (inclusive em 390 px). |
| P1 | Avisos mostravam só `motivo` (`FALHAS_ACIMA_DO_LIMITE`); a causa real (`causas`, ex. `SPTRANS_HTTP_503`) não aparecia. | Motivo legível + código + causas, na tabela, no gráfico, na imagem e no mapa. |
| P1 | `incompleto: null` (percentual NULL, `SEM_EXPECTATIVA`/`NAO_REGISTRADA`) ou bloco ausente não exibia nada — parecia qualidade satisfatória. | “Qualidade da coleta indeterminada (não é 0% de falhas)” na tabela, gráfico e imagem; agrupado por motivo no gráfico. |
| P1 | A US26-T02-FE criou uma segunda página `mapa-indicadores.html` paralela ao mapa da US24 (`indicadores-mapa.html`): não era servida pelo `servidor.py` (404) e seu CSS, anexado a `css/mapa-indicadores.css`, sobrescrevia `.acoes-mapa` e `.popup-indicador` do mapa da US24. | Página, módulos e CSS paralelos removidos; links apontam para o mapa da US24, que passa a ter: contorno de alerta nas geometrias incompletas, motivo/causas no popup e na lista, estado indeterminado e **Imprimir / salvar mapa**. |
| P2 | Download do CSV limitado a 20 s (padrão das consultas). | 120 s para a recomposição da versão (até 31 dias). |

Nenhum cálculo de qualidade foi movido para o navegador: o aviso depende só de
`qualidade_coleta.incompleto`; percentual, motivo, causas e limite são exibidos como recebidos.

## Evidências

- **Respostas reais da API** (rotas Flask, SQLite descartável): `tests/fixtures/backend-sqlite-sintetico/`
  — `/series` na versão A (2 janelas: 13,33% e 10%), na versão B após viagem atrasada +
  consolidação (50 de 96 janelas: `SEM_EXPECTATIVA` nulo, 13,33%, 10%, `SEM_DADOS` 100%),
  o CSV da versão A pedido **depois** de B e o 410 com o arquivo removido.
- **Navegador** (Firefox headless via Selenium, `scripts/conferir_exportacao_us25_t03.py`),
  [`navegador.json`](../evidencias/US25-T03-US26-FE/navegador.json):
  1. Painel exibe a versão A ([tela](../evidencias/US25-T03-US26-FE/1-painel-versao-A.jpg)); imagem SVG baixada ([arquivo](../evidencias/US25-T03-US26-FE/imagem-versao-A.svg)).
  2. Clique em “Baixar CSV desta versão”; a requisição (com `versao_dados=A`) fica retida no navegador.
  3. O backend publica B; a **atualização automática do próprio painel** (61 s) passa a exibir B (50 linhas).
  4. A requisição é liberada: o arquivo entregue é o da versão A — 2 linhas, 12:15 continua `null`
     (em B virou 100), mesmo `versao_conjunto`, contagens e `qualidade_coleta`
     ([CSV](../evidencias/US25-T03-US26-FE/csv-versao-A-baixado-apos-B.csv)); a mensagem avisa que o
     painel mudou durante a exportação ([tela](../evidencias/US25-T03-US26-FE/2-painel-B-apos-exportar-A.jpg)).
  5. Conjunto de B removido → 410 → “Nenhum arquivo foi baixado”, 0 downloads ([tela](../evidencias/US25-T03-US26-FE/3-falha-410.jpg)).
  6. 390 px sem rolagem horizontal ([tela](../evidencias/US25-T03-US26-FE/4-mobile-B.jpg)).
- `node --test`: 169 testes; `tests/series-painel-exportacao.test.mjs` (7) e
  `tests/series-avisos.test.mjs` (10) usam as respostas reais acima; `python -m pytest tests/test_servidor.py`: 3.

## Limites desta evidência

- Mapa: validado por testes de módulo com `qualidade_coleta` real; **não** houve sessão no
  navegador com `/mapas/indicadores` (o cenário sintético não tem paradas/trechos geolocalizados).
- 0% e 10,1% são respostas **controladas** (a resposta real com `qualidade_coleta` trocada por
  valores do contrato); 10%, 13,33%, 100% e NULL vêm da API.
- Nada disso comprova operação contínua com dados reais da SPTrans.
- **Decisão do PO:** o CSV traz todas as páginas da seleção na versão exibida (contrato da
  US25-T01); a imagem é da página visível. Confirmar se isso atende “idêntica aos dados exibidos”.
