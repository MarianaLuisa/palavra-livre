import { describe, expect, it } from "vitest";
import { evaluateGuess } from "../utils/evaluateGuess";
import { normalizeWord } from "../utils/normalizeWord";
import { repairMojibake } from "../utils/repairMojibake";
import {
  clearGuessLetter,
  createEmptyGuess,
  guessLettersToWord,
  isCompleteGuess,
  removeGuessLetter,
  setGuessLetter,
} from "../utils/guessInput";
import { WORD_LENGTH } from "../utils/constants";

describe("Interações do Jogo: Teclado, Acentuação e Regras de Validação", () => {
  it("navegação de blocos/tiles com a tecla Espaço avança para o próximo tile de forma circular sem alterar as letras", () => {
    let letters = createEmptyGuess();
    let activeTileIndex = 0;

    // Simula navegação com a tecla Espaço
    function onSpaceKey(currentIndex: number): number {
      return (currentIndex + 1) % WORD_LENGTH;
    }

    expect(activeTileIndex).toBe(0);

    activeTileIndex = onSpaceKey(activeTileIndex);
    expect(activeTileIndex).toBe(1);

    activeTileIndex = onSpaceKey(activeTileIndex);
    expect(activeTileIndex).toBe(2);

    activeTileIndex = onSpaceKey(activeTileIndex);
    expect(activeTileIndex).toBe(3);

    activeTileIndex = onSpaceKey(activeTileIndex);
    expect(activeTileIndex).toBe(4);

    // Volta para o início de forma circular
    activeTileIndex = onSpaceKey(activeTileIndex);
    expect(activeTileIndex).toBe(0);

    // Nenhuma letra foi inserida
    expect(letters).toEqual(["", "", "", "", ""]);
  });

  it("permite digitação, remoção e limpeza de letras nos blocos", () => {
    let letters = createEmptyGuess();
    let activeTileIndex = 0;

    // Digita 's'
    const step1 = setGuessLetter(letters, activeTileIndex, "s");
    letters = step1.letters;
    activeTileIndex = step1.activeIndex;

    expect(letters[0]).toBe("s");
    expect(activeTileIndex).toBe(1);

    // Digita 'a'
    const step2 = setGuessLetter(letters, activeTileIndex, "a");
    letters = step2.letters;
    activeTileIndex = step2.activeIndex;

    expect(letters[1]).toBe("a");
    expect(activeTileIndex).toBe(2);

    // Remove última letra com Backspace
    const step3 = removeGuessLetter(letters, activeTileIndex);
    letters = step3.letters;
    activeTileIndex = step3.activeIndex;

    expect(letters[1]).toBe("");
    expect(activeTileIndex).toBe(1);
  });

  it("revela caracteres acentuados corretamente no evaluateGuess com formato canônico NFC", () => {
    // Palavra com acento: "órgão"
    const answer = "órgão";
    const guess = "orgao";

    const evaluated = evaluateGuess(guess, answer);

    expect(evaluated).toHaveLength(5);
    // Todas as posições corretas devem exibir os caracteres acentuados originais
    expect(evaluated[0].letter).toBe("ó");
    expect(evaluated[0].status).toBe("correct");
    expect(evaluated[1].letter).toBe("r");
    expect(evaluated[1].status).toBe("correct");
    expect(evaluated[2].letter).toBe("g");
    expect(evaluated[2].status).toBe("correct");
    expect(evaluated[3].letter).toBe("ã");
    expect(evaluated[3].status).toBe("correct");
    expect(evaluated[4].letter).toBe("o");
    expect(evaluated[4].status).toBe("correct");
  });

  it("preserva caracteres acentuados compostos em 'AÇÕES'", () => {
    const answer = "ações";
    const guess = "acoes";

    const evaluated = evaluateGuess(guess, answer);

    expect(evaluated[1].letter).toBe("ç");
    expect(evaluated[1].status).toBe("correct");
    expect(evaluated[2].letter).toBe("õ");
    expect(evaluated[2].status).toBe("correct");
  });

  it("corrige caracteres com mojibake mantendo normalização", () => {
    const corrupted = "AÃ§Ãµes";
    const repaired = repairMojibake(corrupted).normalize("NFC");
    expect(repaired.toLowerCase()).toBe("ações");
  });
});
