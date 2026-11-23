# US09-T02-FE — Downloads de brutos e dicionário na tela

Responsável: Bernardo. Iniciada em 23/11/2026. Categoria: Código / Frontend.
Estado: implementação e verificações locais concluídas; aguarda revisão de
outra pessoa e validação com o serviço de downloads ativo. Data de Pronta em aberto.

## Entrega

Página `brutos.html`, com acesso pela navegação principal do Observa SP.
Preserva a estrutura integrada de Mapa, Qualidade e Acervo da main, incluindo
o redirecionamento de `qualidade.html` para `/#qualidade`. A página de brutos
oferece retorno às três áreas e adapta a disposição ao celular.

- Lista os dias publicados, do mais recente para o mais antigo, com quantidade
  de registros. Permite escolher um dia da lista ou consultar uma data.
- Exibe tamanho, registros, data de geração em São Paulo e o link do arquivo
  correspondente ao dia selecionado.
- Mostra carregamento, erro com nova tentativa, catálogo vazio e arquivo ainda
  indisponível. Um arquivo publicado com zero registros continua disponível.
- Apresenta o dicionário em tabela, incluindo tipos, descrições, unidades e
  indicação de campos anuláveis. Também oferece o link para abrir o JSON original.
- Fonte, licença, campos e links vêm da API; falhas não recebem dados fictícios.

## Dependência e contrato utilizado

Frontend integrado a `origin/main` no commit `fd8bf2a`. Contrato da US09-T02
conferido no backend `origin/main`, commit `5a14687`, em
`app/exportacoes/routes.py`, `app/exportacoes/parquet.py` e `docs/US09-T02.md`.
Nenhum arquivo do backend ou banco foi alterado nesta tarefa.

| Consulta | Uso na tela |
| --- | --- |
| `GET /api/downloads/brutos/datas` | Catálogo: `datas`, `total`, `fonte`, `licenca` e `dicionario` |
| URL `datas[].url` retornada pela API | Link para receber o anexo Parquet do dia |
| URL `dicionario` retornada pela API | Conteúdo do dicionário e link para a versão original |

Os campos de cada dia são `data`, `registros`, `tamanho_bytes`, `gerado_em`
e `url`. O dicionário usa `campos`, `formato`, `recorte`, `disponibilidade`,
`fonte` e `licenca`. Não há credenciais ou conexão ao MySQL no navegador.

O clique padrão em **Baixar Parquet** verifica os cabeçalhos com `HEAD` na
URL publicada pelo backend. Com resposta 200 e o tipo Parquet esperado, o
navegador acessa essa mesma URL e recebe o anexo por `Content-Disposition`.
Não usa Blob, conversor, exportador ou gerador de arquivos no frontend.

Um 404 nessa verificação remove a ação de download e mostra indisponibilidade.
Outros erros exibem uma mensagem e permitem tentar novamente. A indicação
"Download solicitado" não afirma que o navegador terminou de salvar o arquivo.
Cancelar/trocar o dia invalida a verificação anterior. Alterar a data no campo
sem confirmar não muda o arquivo que o cartão está exibindo.

Links são aceitos somente para os endpoints de brutos do mesmo backend e, no
caso do arquivo, para a data do item. Datas duplicadas, metadados inválidos,
URLs externas ou executáveis e respostas incompletas geram erro visível.
Textos vindos do dicionário são escapados antes de entrar na tabela.

## Abrir a página

1. Iniciar o backend atualizado que contém a US09-T02 no endereço público/local
   configurado. A meta `api-base` em `brutos.html` usa `http://localhost:5000`.
2. Na pasta deste frontend, executar:

   ```powershell
   python servidor.py
   ```

3. Abrir `http://127.0.0.1:5173/brutos.html` ou clicar em **Dados brutos** na
   navegação principal. O servidor local inclui essa página na lista de arquivos
   públicos, sem liberar arquivos internos do repositório.
4. Selecionar um dia publicado, baixar o Parquet e consultar a tabela ou
   **Abrir original** no dicionário. Uma data fora do catálogo deve aparecer
   como indisponível, sem link de download inventado.

Para outro endereço, ajustar `api-base` e permitir a origem do frontend no CORS
da instalação do backend. O backend atual permite as origens locais na porta 5173.
Não abrir o HTML diretamente por `file://`, pois a página usa módulos e HTTP.

**Limitação observada em 23/11/2026:** o processo já ativo em
`http://localhost:5000` devolveu **HTTP 404** para
`/api/downloads/brutos/datas`, embora a rota exista no código atual do backend.
Não reiniciamos nem alteramos esse processo. A integração operacional depende
de iniciar a versão correta do serviço e de haver arquivos publicados.

## Verificação da própria tarefa

Sem instalação npm; requer Node 20+:

```powershell
node --test tests/brutos.test.mjs tests/acervo.test.mjs tests/qualidade.test.mjs tests/mapa/atualizacao.test.mjs
```

Resultado: **27 testes passaram**, sem falhas ou ignorados. São oito testes
da tarefa, além dos testes existentes de acervo, qualidade e atualização do mapa.
`git diff --check` passou.

Os novos testes cobrem: catálogo e dia do link, zero registros, catálogo vazio,
metadados inválidos, URLs fora do contrato, consulta sem credenciais, erros,
timeout/cancelamento, verificação só de cabeçalhos e leitura do dicionário.

A conferência no Chrome também verificou:

- Dia selecionado e nome/conteúdo do anexo recebido pelo navegador.
- Edição da data sem confirmação e troca durante uma verificação pendente.
- Tabela de 11 campos e abertura do dicionário original em outra aba.
- Carregamento, catálogo vazio, 404 de arquivo removido, erro e nova tentativa.
- Erro isolado do dicionário sem bloquear um arquivo disponível.
- Texto HTML exibido como texto, sem execução.
- Layouts de 1440, 390 e 320 pixels, sem rolagem horizontal da página no celular.
- Ausência de exceções JavaScript.
- Servidor `servidor.py` servindo a página de brutos e seus módulos.
- Redirecionamento de Qualidade, acesso aos downloads pela navegação da main
  e retorno ao Acervo, preservando as três abas existentes.

**Esses testes de navegador usam respostas sintéticas**, com o formato observado
no contrato da US09-T02, interceptadas apenas pela automação. O fixture fica em
`tests/fixtures/brutos-us09.json` e nunca é carregado pela página de produção.
O corpo do anexo nesse ensaio testa o transporte e a correspondência do dia;
não é evidência de um Parquet real válido ou de dados operacionais disponíveis.
Essa validação de formato pertence ao backend e deve ser conferida na integração.

Evidências da tarefa:

- [Registro da verificação no navegador](evidencias/US09-T02-FE-verificacao.json).
- [Tela de computador](evidencias/brutos-desktop.jpg).
- [Tela de celular](evidencias/brutos-mobile.jpg).
- [Arquivo indisponível](evidencias/brutos-indisponivel.jpg).
- [Erro ao consultar o catálogo](evidencias/brutos-erro.jpg).
- [Navegação integrada com o Acervo](evidencias/brutos-merge-navegacao.jpg).

Antes de concluir o cartão, outra pessoa deve revisar a alteração e repetir
o download e a abertura do dicionário com a API da equipe disponível.
