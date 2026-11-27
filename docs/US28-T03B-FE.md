# US28-T03B — Acompanhamento da extração no frontend

Seção **Extração por linha e período** em `brutos.html#extracao` (menu **Dados brutos**).
Pede a extração assíncrona de brutos de uma linha e acompanha o estado publicado pelo
backend até o download. Depende da US28-T03A (`GET /extracoes/{id}`).

## Fluxo

Formulário → `POST /api/extracoes` → **202** → id guardado → `GET /api/extracoes/{id}`
a cada 5 s → estado do servidor → link de download só em `pronto`.

| Estado do servidor | Tela |
| --- | --- |
| `aguardando` | Selo âmbar "Aguardando" · "Pedido recebido e ainda não processado." |
| `processando` | Selo azul "Processando" · registros gravados e horário, **só** se `progresso.atualizado_em` vier preenchido; nunca percentual |
| `pronto` | Selo verde "Pronto" · botão **Baixar arquivo** com `arquivo.download`, nome, tamanho e SHA-256 |
| `erro` | Selo vermelho "Erro" · `mensagem` do servidor; sem link |

O frontend não deriva estados: mostra o `estado` recebido, para o polling em `pronto`/`erro`
e só cria o link quando `estado = pronto` e `arquivo.download` aponta para
`/api/extracoes/{mesmo id}/arquivo` no mesmo backend de `js/comum/config.mjs`.
O HTTP 202 não é anunciado como sucesso: se o backend devolve um pedido idêntico já
pronto (idempotência), a mensagem diz isso; caso contrário, "ainda não está pronto".

## Preservação e retomada

- O id opaco vai para a URL (`brutos.html?extracao=<id>`, via `history.replaceState`) e para
  `localStorage` (`observasp.extracao`, protegido por `try/catch`). Recarregar, reabrir pelo menu
  ou compartilhar a URL retoma o mesmo pedido, sem novo POST.
- **Já fez um pedido?** aceita o código e passa a acompanhá-lo.
- **Deixar de acompanhar** cancela timer e consulta e limpa URL/armazenamento.
- Id inexistente (404): "Pedido de extração não encontrado", sem "Tentar novamente"; o id salvo é descartado.
- Falha de conexão, 503 ou resposta inválida: o último estado recebido continua visível, o aviso
  informa a próxima consulta automática (espera dobrada a cada falha seguida, até 60 s; volta a 5 s
  no primeiro sucesso) e **Tentar novamente** repete só o GET (nenhuma nova extração). Review US28:
  antes o polling parava na primeira falha e um pedido em andamento deixava de ser acompanhado.
- Um POST que termina depois de o usuário passar a acompanhar outro pedido (ou deixar de acompanhar)
  não troca o acompanhamento: o novo código aparece na mensagem de status.

## Polling

`INTERVALO_EXTRACAO_MS = 5000` (configurável em `instalarExtracao({ intervaloMs })`). Um único
`setTimeout` agendado após cada resposta (nunca `setInterval`); no máximo uma consulta em andamento;
trocar de pedido aborta a consulta anterior e respostas atrasadas são ignoradas. Tempo limite de 20 s
por consulta (`requisitar`). Teto da espera após falhas: `ESPERA_MAXIMA_MS = 60000`
(`instalarExtracao({ esperaMaximaMs })`).

## Arquivos

- `js/brutos/extracao-modelo.mjs` — validação do contrato, link de download, corpo do POST.
- `js/brutos/extracao-cliente.mjs` — POST/GET com `requisitar` (sem credenciais, `no-store`).
- `js/brutos/extracao.mjs` — tela: pedido, polling, retomada e mensagens.
- `brutos.html`, `css/brutos.css`, `js/brutos/app.mjs` — seção e estilos reaproveitando os da página.
- `tests/extracoes.test.mjs`, `tests/fixtures/extracoes-us28.json`.
- `scripts/gerar_fixture_extracoes_us28.py` — regenera o fixture pelo backend.

## Testes e evidências

`node --test tests/` — 204 testes (12 desta tarefa). O fixture contém **respostas reais** do
Flask test client da branch `feat/us28-t03a-consulta-estado` (SQLite temporário):
202, aguardando, processando com progresso, pronto, erro, 404 e 400. Regenerar a partir
da raiz do backend:

```sh
PYTHONPATH=. python ../SprintTimeMarrom-FrontEnd/scripts/gerar_fixture_extracoes_us28.py \
  ../SprintTimeMarrom-FrontEnd/tests/fixtures/extracoes-us28.json
```

Conferência no navegador (Brave headless via DevTools Protocol), com a API T03A e o worker
`EXTRACAO_BRUTOS` rodando contra SQLite isolado (600 registros sintéticos da linha 33887):
formulário → 202 → aguardando → processando (200 registros) → recarga sem query (retomado do
`localStorage`) → pronto → download (SHA-256 confere com o anunciado) → erro (recuperado pelo
código) → id inexistente → offline e nova tentativa (só GETs). Capturas em
`docs/evidencias/extracao-us28-*.png` (desktop 1440 px e mobile 390 px).

## Limites e pendências

- Depende da US28-T03A ainda **não integrada** à `main` do backend.
- Dias do formulário convertidos em UTC−03:00 (São Paulo sem horário de verão desde 2019);
  regras de período (máx. 31 dias, encerrado há 10 min) são do servidor e aparecem como mensagem 400.
- O link de download é um `<a href>` comum; se o arquivo sumir entre a consulta e o clique, o
  navegador mostra o JSON 404/409 do backend.
- Sem aviso por e-mail (fora do escopo).
