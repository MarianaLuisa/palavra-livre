# Fonte de palavras

## Fonte recomendada

A fonte principal recomendada para o Palavra Livre e o repositorio `fserb/pt-br`, que disponibiliza um lexico PT-BR sob licenca MIT.

Essa fonte e uma boa base para gerar uma lista ampla de palavras aceitas como tentativas. Mesmo assim, a lista de respostas deve passar por curadoria manual.

## Arquivos gerados

- `src/data/validWords.json`: lista maior, usada para validar tentativas digitadas pelo jogador.
- `src/data/answers.json`: lista menor, usada para sortear as palavras secretas.

Separar essas listas melhora a experiencia: o jogador pode tentar palavras menos comuns, mas o jogo sorteia respostas mais familiares.

## Como gerar

1. Baixe ou copie a lista bruta de palavras para `palavras-originais.txt`, na raiz do projeto.
2. Coloque termos proibidos em `scripts/blocklist.txt`, um por linha.
3. Opcionalmente, coloque respostas boas em `scripts/answers-curadas.txt`, uma por linha.
4. Rode:

```bash
python scripts/preparar-palavras.py
```

O script:

- normaliza acentos;
- transforma `ç` em `c`;
- remove palavras com numeros, hifen, espaco, apostrofo ou simbolos;
- filtra apenas palavras de 5 letras apos normalizacao;
- remove duplicadas;
- gera `validWords.json` e `answers.json`.

## Curadoria de respostas

Para `answers.json`, evite:

- palavras ofensivas;
- nomes proprios;
- siglas;
- termos raros demais;
- flexoes muito estranhas;
- palavras que possam gerar confusao por grafia.

Quando `scripts/answers-curadas.txt` existir e tiver palavras validas, ele sera usado como origem de `answers.json`. Caso contrario, o script usa a lista completa filtrada.
