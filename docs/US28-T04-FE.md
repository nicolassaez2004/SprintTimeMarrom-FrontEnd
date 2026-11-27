# US28-T04-FE — Painel e acompanhamento durante uma extração real

O que foi conferido: a tela de acompanhamento (US28-T03B, `brutos.html#extracao`) e o painel
(US23-T02B, `series.html`), com uma extração **real** em andamento.

Ambiente da conferência:
- API Flask no waitress e worker `python -m app.jobs --tipo EXTRACAO_BRUTOS` em outro processo.
- MySQL 8.0.46 local, base isolada `us28_medicao`, a mesma da US28-T04 (backend).
- Linha 99516, de 02/10 a 25/10/2026, CSV: 2,07 milhões de registros, cerca de 4 min de geração.
- Navegador do app, com o site em `http://localhost:5173`.

| Verificação | Resultado |
|---|---|
| Pedido aceito (202) | "Aguardando", com "O arquivo ainda não está pronto"; sem link e sem progresso inventado |
| Tela utilizável durante a geração | Atraso máximo do laço de eventos de **14 ms** em 8 s de medição. Consultar outro dia do catálogo e "Atualizar lista" responderam normalmente |
| Painel em outra aba | `series.html`: trocar o sentido (ida → volta) recarregou a série em ~2,5 s, com a extração rodando |
| Processando | "Processando" com "N registros gravados até HH:MM, segundo o servidor", acompanhando o servidor (30.000 → 285.000 → 540.000 → 1.170.000 …); nunca percentual |
| Recarga da página | Aberta sem o código na URL, retomou o mesmo pedido pelo `localStorage`: um único GET, nenhum POST novo |
| Pronto | Só quando a API respondeu `pronto`. Link `.../api/extracoes/{id}/arquivo`, nome, 652,6 MB e SHA-256 **idênticos** aos da API |
| Erro | Worker sem permissão de gravar o arquivo: depois das 3 tentativas, "Erro" com a mensagem do servidor ("A geração do arquivo falhou após esgotar as tentativas…"), sem link |

Testes automáticos novos em [tests/extracoes.test.mjs](../tests/extracoes.test.mjs):
- uma consulta pendente não trava a tela: trocar de pedido e "deixar de acompanhar" funcionam
  na hora, e a resposta atrasada de outro pedido é ignorada;
- "pronto" e o download só aparecem com a resposta `pronto` correspondente (um `pronto` sem
  arquivo é recusado).

`node --test "tests/**/*.test.mjs"` → 208 testes, sem falhas.

Nenhum defeito foi encontrado. O código de acompanhamento não precisou de mudança.
