import type { BoardState, GameStatus } from "../types/game";
import { Board } from "./Board";

type GameBoardGridProps = {
  boards: BoardState[];
  currentGuess: string;
  maxAttempts: number;
  gameStatus: GameStatus;
};

export function GameBoardGrid({
  boards,
  currentGuess,
  maxAttempts,
  gameStatus,
}: GameBoardGridProps) {
  return (
    <section className={`board-grid count-${boards.length}`} aria-label="Tabuleiros">
      {boards.map((board, index) => (
        <Board
          key={board.answer}
          board={board}
          boardNumber={index + 1}
          currentGuess={currentGuess}
          maxAttempts={maxAttempts}
          gameStatus={gameStatus}
        />
      ))}
    </section>
  );
}
