# US26-T02-FE — Avisos de dados incompletos

O histórico (`series.html`) lê `qualidade_coleta` nas respostas de `/series`.
Cada linha com `incompleto: true` mostra percentual e motivo; nos gráficos, cada
janela recebe marcador e aviso. O navegador não calcula o percentual nem decide
o limite: só exibe os campos publicados pela API.

O botão **Baixar imagem SVG** salva o gráfico com os marcadores e os textos de
aviso incorporados no arquivo. A tela de mapa em `mapa-indicadores.html` chama
`/indicadores` para listar versões presentes no recorte e `/mapas/indicadores`
para obter as geometrias. As geometrias incompletas ficam destacadas, e seus
motivos aparecem no popup e na lista abaixo do mapa. A ação **Imprimir / salvar
mapa** conserva o resumo e a lista de avisos na impressão.

Filtros de linha, indicador, escopo, período e versão GTFS são mantidos no
formulário durante a consulta; filtros que mudam linha, tipo ou período fazem a
lista de versões ser atualizada. No mapa, período superior a 31 dias é recusado
e a versão GTFS fica explícita para não misturar redes.

## Verificação

```text
node --test tests/series-avisos.test.mjs tests/mapa/indicadores.test.mjs
```

Os testes confirmam que 13,33% e `SPTRANS_HTTP_503` fornecidos pela API são
exibidos e exportados, que `incompleto: false` não gera aviso e que qualidade
indisponível permanece explícita. Não há teste visual automatizado com navegador;
a API e os dados territoriais reais precisam estar disponíveis para conferir o
mapa completo. Resultado: [`US26-T02-FE-verificacao.json`](evidencias/US26-T02-FE-verificacao.json).
