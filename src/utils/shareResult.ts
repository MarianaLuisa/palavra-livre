import type { BoardState, GameMode, GameStatus, LetterStatus } from "../types/game";
import { MODE_CONFIG } from "./constants";

const STATUS_SYMBOLS: Record<LetterStatus, string> = {
  correct: "\u{1F7E9}",
  present: "\u{1F7E8}",
  absent: "\u2B1B",
  empty: "\u2B1B",
};

export function createShareText(
  mode: GameMode,
  status: GameStatus,
  attemptsUsed: number,
  boards: BoardState[],
): string {
  const config = MODE_CONFIG[mode];
  const result =
    status === "won"
      ? `Vitoria em ${attemptsUsed}/${config.maxAttempts}`
      : `Derrota em ${config.maxAttempts}/${config.maxAttempts}`;
  const boardSummaries = boards
    .map((board, index) => {
      const rows = board.rows
        .map((row) => row.map(({ status: letterStatus }) => STATUS_SYMBOLS[letterStatus]).join(""))
        .join("\n");

      return `Palavra ${index + 1}\n${rows}`;
    })
    .join("\n\n");

  return `Palavra Livre - ${config.label}\n${result}\n\n${boardSummaries}`;
}
