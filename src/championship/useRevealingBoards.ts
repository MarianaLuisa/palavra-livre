import { useEffect, useRef, useState } from "react";
import type { ChampionshipBoard } from "./types";

/**
 * Descobre quais tabuleiros receberam uma linha nova na ultima tentativa.
 *
 * Serve para dois propositos, como no Jogo Livre:
 *   1. animar a revelacao apenas nesses tabuleiros;
 *   2. segurar a atualizacao do teclado ate a animacao terminar.
 *
 * Tabuleiros ja resolvidos nao recebem linha e ficam de fora.
 */
export function useRevealingBoards(boards: ChampionshipBoard[]): number[] {
  const previousRowCountsRef = useRef<Record<number, number>>({});
  const [revealingBoards, setRevealingBoards] = useState<number[]>([]);

  useEffect(() => {
    const previousCounts = previousRowCountsRef.current;
    const nextCounts: Record<number, number> = {};
    const changedBoards: number[] = [];

    for (const board of boards) {
      nextCounts[board.boardIndex] = board.rows.length;

      if (board.rows.length > (previousCounts[board.boardIndex] ?? 0)) {
        changedBoards.push(board.boardIndex);
      }
    }

    previousRowCountsRef.current = nextCounts;

    if (changedBoards.length > 0) {
      setRevealingBoards(changedBoards);
    }
  }, [boards]);

  return revealingBoards;
}
