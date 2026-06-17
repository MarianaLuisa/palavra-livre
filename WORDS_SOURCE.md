# Fonte de palavras

## Fontes usadas

A fonte principal recomendada e usada nesta etapa foi o repositorio `fserb/pt-br`, disponivel no GitHub sob licenca MIT:

- https://github.com/fserb/pt-br

Como complemento opcional, tambem foi usada a lista do repositorio `pythonprobr/palavras`:

- https://github.com/pythonprobr/palavras

O jogo nao acessa essas fontes em runtime. Elas sao usadas apenas em tempo de preparacao para gerar arquivos JSON locais.

## Arquivos gerados

- `src/data/validWords.json`: lista grande de palavras aceitas como tentativas.
- `src/data/answers.json`: lista menor, usada para sortear respostas.

Separar essas listas melhora a experiencia: o jogador pode tentar palavras menos comuns, mas as respostas sorteadas tendem a ser mais reconheciveis.

## Curadoria

Nem toda palavra valida deve ser resposta. Respostas precisam de curadoria porque listas lexicais incluem termos raros, nomes proprios, siglas, flexoes pouco naturais e palavras inadequadas para um jogo publico.

O script usa `scripts/answers-curadas.txt` como prioridade. Depois ele completa a lista de respostas com palavras filtradas por frequencia quando a fonte `fserb/pt-br` inclui arquivo ICF.

Tambem existe `scripts/blocklist.txt`, aplicado tanto a `validWords.json` quanto a `answers.json`.

## Como atualizar

1. Baixe ou copie fontes para `word-sources/`.
2. Mantenha `scripts/blocklist.txt` atualizado.
3. Ajuste `scripts/answers-curadas.txt` com respostas boas, se quiser priorizar termos especificos.
4. Rode:

```bash
python scripts/preparar-palavras.py
```

O script:

- le uma ou mais fontes locais;
- normaliza para minusculas;
- remove acentos;
- converte `ç` para `c`;
- filtra apenas palavras com exatamente 5 letras;
- remove palavras com hifen, espaco, numero, apostrofo, simbolos ou caracteres invalidos;
- remove duplicadas;
- aplica blocklist;
- gera os JSONs finais.

## Comando usado nesta etapa

```bash
python scripts/preparar-palavras.py
```

Resultado desta geracao:

- `validWords.json`: 14875 palavras.
- `answers.json`: 2800 respostas.
