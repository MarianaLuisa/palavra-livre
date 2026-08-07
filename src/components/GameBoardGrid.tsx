import type { BoardState, GameStatus } from "../types/game";
import { Board } from "./Board";

type GameBoardGridProps = {
  boards: BoardState[];
  currentGuessLetters: string[];
  activeTileIndex: number;
  maxAttempts: number;
  gameStatus: GameStatus;
  isRevealing: boolean;
  invalidGuessId: number;
  revealingAnswers: string[];
  onTileSelect: (index: number) => void;
};

export function GameBoardGrid({
  boards,
  currentGuessLetters,
  activeTileIndex,
  maxAttempts,
  gameStatus,
  isRevealing,
  invalidGuessId,
  revealingAnswers,
  onTileSelect,
}: GameBoardGridProps) {
  return (
    <section className={`board-grid count-${boards.length}`} aria-label="Tabuleiros">
      {boards.map((board, index) => (
        <Board
          key={board.answer}
          board={board}
          boardNumber={index + 1}
          currentGuessLetters={currentGuessLetters}
          activeTileIndex={activeTileIndex}
          maxAttempts={maxAttempts}
          gameStatus={gameStatus}
          isRevealing={isRevealing && revealingAnswers.includes(board.answer)}
          invalidGuessId={invalidGuessId}
          onTileSelect={onTileSelect}
        />
      ))}
    </section>
  );
}
