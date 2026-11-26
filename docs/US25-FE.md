# US25 — exportação do painel (frontend)

Responsável: Lucas Cruz (LucasCruzFinance). Criada em: 17/11/2026. Iniciada em: 26/11/2026.
Estado: **em revisão**; data de “Pronto” depende da revisão por outra pessoa.

## Comportamento (após a revisão de 26/11/2026)

- O painel fixa resposta, filtros, página, horário e `versao_dados` (objeto da US25-T01) antes de renderizar.
- **Baixar CSV desta versão** pede ao backend `GET /downloads/indicadores?versao_dados=<id>` com os mesmos filtros de `/series` e o período efetivo da resposta. O arquivo traz todas as páginas da seleção, com unidades, contagens, `qualidade_coleta`, fonte e licença, e só é entregue se versão, tipo e total conferem com o painel. Uma atualização do painel durante o download não troca a versão pedida.
- **Baixar imagem SVG** usa o gráfico já exibido, com avisos de qualidade, filtros, página, versão, data local e fonte.
- O CSV diário da US10 continua separado.

Revisão, defeitos corrigidos e evidências: [reviews/US25-T03-US26-FE-review.md](reviews/US25-T03-US26-FE-review.md).
A primeira versão (CSV gerado no navegador e `versao_dados` tratado como texto) foi substituída.
