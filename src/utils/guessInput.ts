import type { GameStatus } from "../types/game";
import { WORD_LENGTH } from "./constants";
import { normalizeWord } from "./normalizeWord";

export function createEmptyGuess(): string[] {
  return Array.from({ length: WORD_LENGTH }, () => "");
}

export function guessLettersToWord(letters: string[]): string {
  return letters.join("");
}

export function isCompleteGuess(letters: string[]): boolean {
  return letters.length === WORD_LENGTH && letters.every((letter) => letter.length === 1);
}

export function setGuessLetter(
  letters: string[],
  index: number,
  rawLetter: string,
): { letters: string[]; activeIndex: number } {
  const normalizedLetter = normalizeWord(rawLetter);

  if (!/^[a-z]$/.test(normalizedLetter) || index < 0 || index >= WORD_LENGTH) {
    return { letters, activeIndex: index };
  }

  const nextLetters = [...letters];
  nextLetters[index] = normalizedLetter;

  return {
    letters: nextLetters,
    activeIndex: Math.min(index + 1, WORD_LENGTH - 1),
  };
}

export function removeGuessLetter(
  letters: string[],
  activeIndex: number,
): { letters: string[]; activeIndex: number } {
  const nextLetters = [...letters];

  if (nextLetters[activeIndex]) {
    nextLetters[activeIndex] = "";
    return { letters: nextLetters, activeIndex };
  }

  const previousIndex = Math.max(activeIndex - 1, 0);
  nextLetters[previousIndex] = "";

  return { letters: nextLetters, activeIndex: previousIndex };
}

export function clearGuessLetter(
  letters: string[],
  activeIndex: number,
): { letters: string[]; activeIndex: number } {
  if (activeIndex < 0 || activeIndex >= WORD_LENGTH) {
    return { letters, activeIndex };
  }

  const nextLetters = [...letters];
  nextLetters[activeIndex] = "";
  return { letters: nextLetters, activeIndex };
}

export function canSubmitGuess(
  status: GameStatus,
  isRevealing: boolean,
  letters: string[],
): boolean {
  return status === "playing" && !isRevealing && isCompleteGuess(letters);
}
