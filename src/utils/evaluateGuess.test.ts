import { describe, expect, it } from "vitest";
import type { BoardState } from "../types/game";
import { evaluateGuess } from "./evaluateGuess";
import { getRandomWords } from "./getRandomWords";
import { getKeyboardStatus } from "./keyboardStatus";
import { normalizeWord } from "./normalizeWord";

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
