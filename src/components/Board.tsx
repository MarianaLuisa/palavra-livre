import type { BoardState, GameStatus } from "../types/game";
import { WORD_LENGTH } from "../utils/constants";
import { Row } from "./Row";

type BoardProps = {
  board: BoardState;
  boardNumber: number;
  currentGuessLetters: string[];
  activeTileIndex: number;
  maxAttempts: number;
  gameStatus: GameStatus;
  isRevealing: boolean;
  invalidGuessId?: number;
  onTileSelect: (index: number) => void;
};

function createEmptyLetters() {
  return Array.from({ length: WORD_LENGTH }, () => ({ letter: "", status: "empty" as const }));
}

function createCurrentLetters(currentGuessLetters: string[]) {
  return Array.from({ length: WORD_LENGTH }, (_, index) => ({
    letter: currentGuessLetters[index] ?? "",
    status: "empty" as const,
  }));
}

export function Board({
  board,
  boardNumber,
  currentGuessLetters,
  activeTileIndex,
  maxAttempts,
  gameStatus,
  isRevealing,
  invalidGuessId = 0,
  onTileSelect,
}: BoardProps) {
  const showCurrentRow =
    gameStatus === "playing" && !board.solved && !isRevealing && board.rows.length < maxAttempts;
  const emptyRowsCount = Math.max(
    maxAttempts - board.rows.length - (showCurrentRow ? 1 : 0),
    0,
  );

  return (
    <article
      className={board.solved ? "board solved" : "board"}
      aria-label={`Tabuleiro da palavra ${boardNumber}`}
    >
      <header className="board-header">
        <div>
          <h2>Palavra {boardNumber}</h2>
          <p>
            {board.rows.length}/{maxAttempts} tentativa
            {board.rows.length === 1 ? "" : "s"}
          </p>
        </div>
        {board.solved ? <span>Resolvida</span> : null}
      </header>

      <div className="board-rows">
        {board.rows.map((row, index) => (
          <Row
            key={`evaluated-${index}`}
            letters={row}
            isEvaluated
            isRevealing={isRevealing && index === board.rows.length - 1}
          />
        ))}

        {showCurrentRow ? (
          <Row
            key={`current-${invalidGuessId}`}
            letters={createCurrentLetters(currentGuessLetters)}
            isCurrent
            isInvalid={invalidGuessId > 0}
            activeTileIndex={activeTileIndex}
            onTileSelect={onTileSelect}
          />
        ) : null}

        {Array.from({ length: emptyRowsCount }, (_, index) => (
          <Row key={`empty-${index}`} letters={createEmptyLetters()} />
        ))}
      </div>
    </article>
  );
}
