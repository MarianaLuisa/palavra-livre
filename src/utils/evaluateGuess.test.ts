import { describe, expect, it } from "vitest";
import answersData from "../data/answers.json";
import validWordsData from "../data/validWords.json";
import type { BoardState } from "../types/game";
import { evaluateGuess } from "./evaluateGuess";
import { getRandomWords } from "./getRandomWords";
import {
  canSubmitGuess,
  createEmptyGuess,
  isCompleteGuess,
  removeGuessLetter,
  setGuessLetter,
} from "./guessInput";
import { getKeyboardStatus } from "./keyboardStatus";
import { normalizeWord } from "./normalizeWord";
import { selectWordsAvoidingHistory } from "./wordHistory";

function statusesFor(guess: string, answer: string) {
  return evaluateGuess(guess, answer).map(({ status }) => status);
}

describe("evaluateGuess", () => {
  it("marca palavra totalmente correta", () => {
    expect(statusesFor("carta", "carta")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("marca letra presente em outra posicao", () => {
    expect(statusesFor("abcde", "eabcd")).toEqual([
      "present",
      "present",
      "present",
      "present",
      "present",
    ]);
  });

  it("marca letra ausente", () => {
    expect(statusesFor("zzzzz", "carta")).toEqual([
      "absent",
      "absent",
      "absent",
      "absent",
      "absent",
    ]);
  });

  it("ignora acentos na comparacao", () => {
    expect(statusesFor("limao", "lim\u00e3o")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("normaliza cedilha para c", () => {
    expect(statusesFor("acude", "a\u00e7ude")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("exibe cedilha da resposta quando a letra esta correta", () => {
    expect(evaluateGuess("cocar", "co\u00e7ar").map(({ letter }) => letter)).toEqual([
      "c",
      "o",
      "\u00e7",
      "a",
      "r",
    ]);
  });

  it("trata letras repetidas respeitando ocorrencias reais", () => {
    expect(statusesFor("aaaaa", "arara")).toEqual([
      "correct",
      "absent",
      "correct",
      "absent",
      "correct",
    ]);
  });
});

describe("normalizeWord", () => {
  it("remove acentos e converte cedilha", () => {
    expect(normalizeWord("Ma\u00e7\u00e3s")).toBe("macas");
  });
});

describe("getRandomWords", () => {
  it("nao retorna palavras duplicadas", () => {
    const words = getRandomWords(
      3,
      ["carta", "carta", "sabor", "lim\u00e3o", "limao", "a\u00e7ude"],
      () => 0.5,
    );
    const normalizedWords = words.map(normalizeWord);

    expect(words).toHaveLength(3);
    expect(new Set(normalizedWords).size).toBe(words.length);
  });

  it("respeita a quantidade pedida", () => {
    expect(getRandomWords(2, ["carta", "sabor", "verde"], () => 0)).toHaveLength(2);
  });
});

describe("wordHistory", () => {
  it("nao retorna duplicadas na mesma partida", () => {
    const selection = selectWordsAvoidingHistory(
      4,
      ["carta", "sabor", "verde", "livro", "piano"],
      [],
      () => 0,
    );

    expect(new Set(selection.words.map(normalizeWord)).size).toBe(selection.words.length);
  });

  it("evita repetir palavras ja usadas", () => {
    const selection = selectWordsAvoidingHistory(
      2,
      ["carta", "sabor", "verde", "livro"],
      ["carta", "sabor"],
      () => 0,
    );

    expect(selection.words.map(normalizeWord).sort()).toEqual(["livro", "verde"]);
    expect(selection.historyWasReset).toBe(false);
  });

  it("reseta historico quando nao ha respostas disponiveis suficientes", () => {
    const selection = selectWordsAvoidingHistory(
      2,
      ["carta", "sabor", "verde"],
      ["carta", "sabor"],
      () => 0,
    );

    expect(selection.words).toHaveLength(2);
    expect(selection.nextHistory).toHaveLength(2);
    expect(selection.historyWasReset).toBe(true);
  });
});

describe("guessInput", () => {
  it("preenche a celula ativa e avanca", () => {
    const result = setGuessLetter(createEmptyGuess(), 2, "R");

    expect(result.letters).toEqual(["", "", "r", "", ""]);
    expect(result.activeIndex).toBe(3);
  });

  it("backspace apaga a celula ativa ou a anterior", () => {
    const first = setGuessLetter(createEmptyGuess(), 0, "c");
    const second = setGuessLetter(first.letters, 1, "a");
    const result = removeGuessLetter(second.letters, 2);

    expect(result.letters).toEqual(["c", "", "", "", ""]);
    expect(result.activeIndex).toBe(1);
  });

  it("tentativa incompleta nao submete", () => {
    const letters = ["c", "a", "", "t", "a"];

    expect(isCompleteGuess(letters)).toBe(false);
    expect(canSubmitGuess("playing", false, letters)).toBe(false);
  });

  it("isRevealing bloqueia nova submissao", () => {
    expect(canSubmitGuess("playing", true, ["c", "a", "r", "t", "a"])).toBe(false);
  });
});

describe("word data", () => {
  it("mantem validWords e answers com palavras normalizadas de 5 letras", () => {
    for (const words of [validWordsData, answersData]) {
      const normalizedWords = words.map(normalizeWord);

      expect(normalizedWords.every((word) => /^[a-z]{5}$/.test(word))).toBe(true);
      expect(new Set(normalizedWords).size).toBe(words.length);
    }
  });

  it("mantem uma base curada de respostas sorteaveis", () => {
    expect(answersData.length).toBeGreaterThanOrEqual(1500);
  });

  it("mantem respostas livres de casos ruins conhecidos", () => {
    const answers = new Set(answersData.map(normalizeWord));

    expect(answers).not.toContain("apolo");
    expect(answers).not.toContain("crato");
    expect(answers).not.toContain("hobby");
    expect(answers).not.toContain("bosta");
    expect(answers).not.toContain("anona");
    expect(answers).not.toContain("macar");
    expect(answers).not.toContain("sande");
    expect(answers).not.toContain("ivate");
    expect(answers).not.toContain("gesta");
    expect(answers).not.toContain("disna");
    expect(answers).not.toContain("liceu");
    expect(answers).not.toContain("parla");
    expect(answers).not.toContain("vogar");
    expect(answers).not.toContain("cumim");
    expect(answers).not.toContain("opora");
    expect(answers).not.toContain("amato");
    expect(answers).not.toContain("touri");
    expect(answers).not.toContain("aticu");
    expect(answers).not.toContain("agror");
    expect(answers).not.toContain("canon");
    expect(answers).not.toContain("gauss");
    expect(answers).not.toContain("recta");
    expect(answers).not.toContain("staff");
    expect(answers).not.toContain("crush");
    expect(answers).not.toContain("pixel");
  });

  it("permite verbos no infinitivo como respostas e remove conjugacoes", () => {
    const answers = new Set(answersData.map(normalizeWord));

    expect(answers).toContain("beber");
    expect(answers).toContain("falar");
    expect(answers).toContain("gemer");
    expect(answers).not.toContain("beija");
    expect(answers).not.toContain("olhou");
  });

  it("inclui ICF amplo nas tentativas e corta respostas sem frequencia suficiente", () => {
    const validWords = new Set(validWordsData.map(normalizeWord));
    const answers = new Set(answersData.map(normalizeWord));

    expect(validWords).toContain("areio");
    expect(answers).not.toContain("areio");
    expect(answers).toContain("carta");
  });

  it("mantem respostas dentro da base valida", () => {
    const validWords = new Set(validWordsData);

    expect(answersData.every((word) => validWords.has(normalizeWord(word)))).toBe(true);
  });
});

describe("getKeyboardStatus", () => {
  it("respeita prioridade correct > present > absent > empty", () => {
    const boards: BoardState[] = [
      {
        answer: "carta",
        solved: false,
        rows: [[
          { letter: "a", status: "absent" },
          { letter: "b", status: "present" },
          { letter: "c", status: "correct" },
        ]],
      },
      {
        answer: "sabor",
        solved: false,
        rows: [[
          { letter: "a", status: "correct" },
          { letter: "b", status: "absent" },
          { letter: "c", status: "present" },
        ]],
      },
    ];

    expect(getKeyboardStatus(boards)).toMatchObject({
      a: "correct",
      b: "present",
      c: "correct",
    });
  });
});
