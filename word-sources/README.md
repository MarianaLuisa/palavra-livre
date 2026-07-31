# Fontes locais de palavras

Coloque aqui os arquivos brutos usados para gerar as listas do jogo. Os arquivos de fonte em si sao ignorados pelo Git para evitar versionar bases grandes; este README permanece no repositorio para documentar o fluxo.

Fonte principal atual:

- `fserb/pt-br`, corpus PT-BR sob licenca MIT.
- Repositorio: https://github.com/fserb/pt-br/tree/master
- Arquivo usado: `lexico`.

Arquivo esperado pelo script:

- `fserb-pt-br-lexico.txt`

Depois de colocar ou atualizar o arquivo, rode na raiz do projeto:

```bash
python scripts/preparar-palavras.py
```

O script gera:

- `src/data/validWords.json`
- `src/data/answers.json`

Use `scripts/blocklist.txt` para remover termos de todas as listas e `scripts/answer-blocklist.txt` para bloquear apenas respostas ruins.

Os JSONs finais sao versionados; os arquivos brutos desta pasta nao.
