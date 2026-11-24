# US18-T03A-FE — espera e excesso de espera por parada

**Status: pronto** (branch `US18`).

O painel por linha (`series.html`, US23-T02B) ganhou o indicador **Espera
estimada e excesso de espera**, que é por parada e exige o filtro Parada.

O painel busca as duas séries da API (`ESPERA_ESTIMADA` e `EXCESSO_ESPERA`, em
`GET /series`) para a mesma página e as mesmas janelas.

Cada linha da tabela mostra **separadamente**:
- a espera estimada e o excesso de espera, cada um com a sua unidade (`min`);
- o motivo de cada ausência; a ausência nunca vira zero;
- a espera programada e os intervalos usados.

O excesso negativo aparece com o sinal. Os gráficos mostram as duas séries,
cada uma com o seu título ("Espera estimada" e "Excesso de espera").

Se qualquer uma das duas consultas falhar, o painel mostra o erro e não exibe
meia tela. Se as janelas das duas não coincidirem, a resposta é recusada.

Arquivos: `js/series/espera.mjs`, `js/series/modelo.mjs`, `js/series/app.mjs`,
`js/series/graficos.mjs`, `js/series/regularidade.mjs` (motivos) e `series.html`.

## Verificação

- `tests/series-espera.test.mjs` compara a tela com **respostas conhecidas** de
  `GET /series`, geradas pelo backend da US18
  (`tests/fixtures/series-espera-us18.json`). São conferidos:
  - espera 2,35 min, excesso −0,15 min e espera programada 2,5 min;
  - a janela insuficiente, sem resultado e com o motivo de cada lado;
  - o excesso sem intervalo programado;
  - a falha de uma das consultas e as janelas que não coincidem.
- No navegador, contra o backend da branch `US18` (caso C04 da US18-T03B,
  janela que cruza faixas), a tela reproduziu a API:
  - espera 2,35 min, excesso −1,82 min e espera programada 4,17 min;
  - as janelas sem resultado mostraram o motivo;
  - os gráficos ficaram com títulos distintos.
- Os estados também foram conferidos no navegador:
  - **carregando:** aviso visível e resultado oculto enquanto a resposta não chega;
  - **erro:** com 503 na consulta do excesso, aparece a mensagem de erro e o
    resultado fica oculto.

```powershell
node --test
```
