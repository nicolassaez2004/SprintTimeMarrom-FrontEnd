# US17-T03A-FE — regularidade e agrupamento no painel

O painel existente (`series.html`, US23-T02B) ganhou o indicador **Regularidade
dos intervalos** (`REGULARIDADE_INTERVALOS`, US17-T03A). Como esse indicador é
publicado por parada, o filtro **Parada** passa a ser obrigatório para ele e não
é aceito nos demais indicadores.

Cada ponto mostra:
- o CV com três casas e a unidade (`CV (adimensional)`);
- a sinalização de agrupamento (sim acima de 0,5, não até 0,5, ou "não avaliado
  sem CV");
- o motivo da ausência quando a API devolve `valor: null`. A ausência nunca
  vira zero: o texto é "Sem resultado" e o ponto não entra no gráfico;
- o número de intervalos usados.

Arquivos: `js/series/regularidade.mjs`, `js/series/modelo.mjs`,
`js/series/app.mjs` e `series.html`.

## Verificação

- `tests/series-regularidade.test.mjs` compara a tela com uma **resposta
  conhecida** de `GET /series`, gerada pelo backend da US17 com dados
  sintéticos (`tests/fixtures/series-regularidade-us17.json`). São conferidos:
  - o CV 0,288 e "sem agrupamento";
  - a janela insuficiente, sem resultado e com o motivo;
  - a janela sem coleta, com o motivo da coleta;
  - a validação da parada.
- No navegador, contra o backend da branch `US17` (caso C07 da US17-T03B, linha
  `SINT-US17`, parada B, 09:00–09:45), a tabela reproduziu a API:
  - 1,088 com agrupamento;
  - 0,833 com agrupamento;
  - "Sem resultado · Menos de três passagens na janela";
  - o gráfico com apenas os dois pontos com valor.

```powershell
node --test
```
