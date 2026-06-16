import type { BoardState, LetterStatus } from "../types/game";
import { STATUS_PRIORITY } from "./constants";
import { normalizeWord } from "./normalizeWord";

export function getKeyboardStatus(boards: BoardState[]): Record<string, LetterStatus> {
  const statuses: Record<string, LetterStatus> = {};

  boards.forEach((board) => {
    board.rows.flat().forEach(({ letter, status }) => {
      const normalizedLetter = normalizeWord(letter);
      const previousStatus = statuses[normalizedLetter] ?? "empty";

      if (STATUS_PRIORITY[status] > STATUS_PRIORITY[previousStatus]) {
        statuses[normalizedLetter] = status;
      }
    });
  });

  return statuses;
}
