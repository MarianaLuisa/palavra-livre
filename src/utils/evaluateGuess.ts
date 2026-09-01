import type { EvaluatedLetter, LetterStatus } from "../types/game";
import { normalizeWord } from "./normalizeWord";
import { repairMojibake } from "./repairMojibake";

export function evaluateGuess(guess: string, answer: string): EvaluatedLetter[] {
  const cleanAnswer = repairMojibake(answer).normalize("NFC");
  const normalizedGuess = normalizeWord(guess);
  const normalizedAnswer = normalizeWord(cleanAnswer);
  const guessLetters = [...normalizedGuess];
  const answerLetters = [...normalizedAnswer];
  const displayAnswerLetters = [...cleanAnswer.toLowerCase()];
  const remainingLetters = new Map<string, number>();

  const evaluated: EvaluatedLetter[] = guessLetters.map((letter) => ({
    letter,
    status: "absent",
  }));

  answerLetters.forEach((letter, index) => {
    if (guessLetters[index] === letter) {
      evaluated[index] = {
        letter: displayAnswerLetters[index] ?? guessLetters[index],
        status: "correct",
      };
      return;
    }

    remainingLetters.set(letter, (remainingLetters.get(letter) ?? 0) + 1);
  });

  guessLetters.forEach((letter, index) => {
    if (evaluated[index].status === "correct") {
      return;
    }

    const remainingCount = remainingLetters.get(letter) ?? 0;
    const status: LetterStatus = remainingCount > 0 ? "present" : "absent";
    evaluated[index] = { letter, status };

    if (remainingCount > 0) {
      remainingLetters.set(letter, remainingCount - 1);
    }
  });

  return evaluated;
}
