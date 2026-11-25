# US26-T03-FE — Testes dos avisos de qualidade

Verifica respostas simuladas para 0%, 10%, 10,1% e qualidade ausente no histórico
e no mapa. A interface respeita `incompleto` e o motivo enviados pela API, sem
recalcular o limite. Uma resposta posterior substitui o aviso anterior no
gráfico deixa de avisar em 10% e passa a mostrar 10,1% e o motivo novo; o SVG
exportado contém os mesmos valores do gráfico atualizado.

Verificação executada na pasta `SprintTimeMarrom-FrontEnd`:

```text
node tests/series-avisos.test.mjs
node tests/mapa-indicadores.test.mjs
node tests/series-exportacao.test.mjs
git diff --check
```

Resultado: 36 verificações passaram (4 séries, 18 mapa e 14 exportação); sem
erros de whitespace. Não foi alterado o código do servidor. A atualização foi
simulada com respostas conhecidas nos módulos de apresentação; não foi feita
uma sessão visual no navegador nem chamada à API real.
