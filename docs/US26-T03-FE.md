# US26-T03-FE — Testes dos avisos de qualidade

`tests/series-avisos.test.mjs` e o teste US26 de `tests/mapa-indicadores.test.mjs` usam
respostas de `/series` capturadas do backend real (SQLite descartável, dados sintéticos;
`tests/fixtures/backend-sqlite-sintetico/`).

| Cenário | Origem | Resultado |
|---|---|---|
| 0% com coleta válida | controlada | sem aviso |
| 10% | API | sem aviso |
| 10,1% | controlada | aviso, percentual e motivo |
| 13,33% (`SPTRANS_HTTP_503`) | API | aviso com causa |
| Ausência total de coleta (`SEM_DADOS`) | API | aviso de 100% |
| Percentual NULL (`SEM_EXPECTATIVA`) | API | indeterminado, nunca 0% |
| Nova resposta | API/controlada | aviso antigo some da tela e da imagem |

Também cobertos: zero observado x ausência, imagem com avisos/período/versão, quebra de
texto em 390 px, destaque da geometria no mapa. No navegador foram conferidas a troca de
resposta (versão A → B pela atualização automática, avisos refeitos) e o estado de erro da
exportação (ver [reviews/US25-T03-US26-FE-review.md](reviews/US25-T03-US26-FE-review.md)).
Troca manual de filtros e estado de carregamento **não** tiveram ensaio específico no
navegador: no código, cada mudança limpa o resultado (`series:limpar`) antes de exibir a nova
resposta.

```text
node --test
```
