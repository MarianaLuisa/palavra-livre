import { Board } from "../../components/Board";
import type { BoardState, GameStatus } from "../../types/game";
import type { ChampionshipBoard } from "../types";

type ChampionshipBoardGridProps = {
  boards: ChampionshipBoard[];
  currentGuessLetters: string[];
  activeTileIndex: number;
  maxAttempts: number;
  gameStatus: GameStatus;
  isRevealing: boolean;
  revealingBoards: number[];
  onTileSelect: (index: number) => void;
};

/**
 * Reaproveita o mesmo Board do Jogo Livre.
 * Diferenca: aqui a resposta pode ser desconhecida, entao os tabuleiros
 * sao identificados pelo indice e nao pela palavra secreta.
 */
export function toBoardState(board: ChampionshipBoard): BoardState {
  return {
    answer: board.answer ?? "",
    solved: board.solved,
    rows: board.rows,
  };
}

export function ChampionshipBoardGrid({
  boards,
  currentGuessLetters,
  activeTileIndex,
  maxAttempts,
  gameStatus,
  isRevealing,
  revealingBoards,
  onTileSelect,
}: ChampionshipBoardGridProps) {
  return (
    <section className={`board-grid count-${boards.length}`} aria-label="Tabuleiros da modalidade">
      {boards.map((board) => (
        <Board
          key={board.boardIndex}
          board={toBoardState(board)}
          boardNumber={board.boardIndex + 1}
          currentGuessLetters={currentGuessLetters}
          activeTileIndex={activeTileIndex}
          maxAttempts={maxAttempts}
          gameStatus={gameStatus}
          isRevealing={isRevealing && revealingBoards.includes(board.boardIndex)}
          onTileSelect={onTileSelect}
        />
      ))}
    </section>
  );
}
