# Fontes locais de palavras

Coloque aqui os arquivos brutos usados para gerar as listas do jogo. Os arquivos de fonte em si sao ignorados pelo Git para evitar versionar bases grandes; este README permanece no repositorio para documentar o fluxo.

Fontes usadas nesta geracao:

- `fserb/pt-br`, fonte principal, licenca MIT.
- `pythonprobr/palavras`, fonte complementar opcional.

Arquivos esperados, por exemplo:

- `fserb-pt-br-lexico.txt`
- `fserb-pt-br-icf.txt`
- `pythonprobr-palavras.txt`

Depois de colocar ou atualizar os arquivos, rode na raiz do projeto:

```bash
python scripts/preparar-palavras.py
```

O script le todos os arquivos desta pasta, ignora arquivos Markdown, aplica normalizacao e gera:

- `src/data/validWords.json`
- `src/data/answers.json`
