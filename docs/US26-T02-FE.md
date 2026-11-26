# US26-T02-FE — Avisos de dados incompletos

O histórico (`series.html`) e o mapa de indicadores (`indicadores-mapa.html`, US24) leem
`qualidade_coleta` da API. O navegador não calcula percentual nem aplica limite: o aviso
depende só de `incompleto`.

- `incompleto: true` → aviso com percentual, motivo e causas, na tabela, no gráfico (marcador e
  texto), na imagem SVG exportada, no popup, na lista do mapa e com contorno na geometria.
- `incompleto: false` (inclusive exatamente 10%) → sem aviso.
- `incompleto: null` ou bloco ausente → “qualidade da coleta indeterminada (não é 0% de falhas)”.
- **Imprimir / salvar mapa** conserva a janela, o resumo de qualidade e a lista de locais.

Código comum: `js/series/avisos.mjs` (usado também por `js/mapa-indicadores/modelo.mjs`).
A página paralela `mapa-indicadores.html` foi removida na revisão de 26/11/2026; ver
[reviews/US25-T03-US26-FE-review.md](reviews/US25-T03-US26-FE-review.md).
