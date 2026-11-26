# US25 — exportação do painel (frontend)

Responsável: Lucas Cruz (LucasCruzFinance). Criada em: 17/11/2026. Iniciada em: 26/11/2026.
Estado: **em revisão**; data de “Pronto” depende da revisão por outra pessoa.

## Comportamento entregue

- O painel fixa resposta, filtros, página e horário juntos antes de renderizar. Gráfico e CSV usam essa mesma cópia, sem nova consulta na exportação.
- O botão **Baixar CSV do painel** exporta as linhas visíveis da página atual, incluindo zero e ausência, versão de cada conjunto, filtros, horário e fonte. O exportador de Blob existente também é usado no novo download.
- **Baixar imagem SVG** usa o gráfico já exibido e inclui título, legenda, filtros, página, versões, data local e fonte. A imagem incorpora os estilos necessários para abrir fora do site.
- O CSV diário da US10 continua separado porque seu recorte e contrato são diferentes do painel paginado da US23.

## Dependência e limite

O backend disponível em 26/11/2026 ainda não publica a `versao_dados` única da US25-T01. Cada resultado de `/series` informa `versao_conjunto`; essa identificação é preservada no CSV e na imagem. Se `versao_dados` vier numa resposta futura, a exportação a carrega junto. Se não houver versão de conjunto suficiente, a exportação falha explicitamente. O fluxo atual fixa a versão **no navegador** e não pede nova extração ao backend; a garantia de uma extração remota por `versao_dados` depende da US25-T01.

## Evidência técnica

- `node --test`: 162 testes passaram.
- `git diff --check`: sem erros.
- Ensaio no Chrome via `scripts/conferir_exportacao_us25.cjs`, com fixture sintético da US23: 4 linhas na tabela e 4 no CSV; valores 92,5, zero e resultado ausente preservados; SVG baixado e aberto no navegador com fonte, data, filtros e versão. Em 390 px, o cartão de exportação ficou visível e a página não teve transbordamento horizontal.
- Arquivos gerados pelo ensaio: `docs/evidencias/US25-painel-sintetico.csv` e `docs/evidencias/US25-grafico-sintetico.svg`. São dados sintéticos, não indicadores da operação real.

Revisão por colega e aceite do PO continuam pendentes antes de mover os cartões a “Pronto”.
