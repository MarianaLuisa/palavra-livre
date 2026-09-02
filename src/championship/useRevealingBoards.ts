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
export function useRevealingBoards(boards: ChampionshipBoard[], roundId?: string): number[] {
  const previousRowCountsRef = useRef<Record<number, number>>({});
  const [revealingBoards, setRevealingBoards] = useState<number[]>([]);
  const currentRoundIdRef = useRef<string | undefined>(roundId);

  useEffect(() => {
    if (currentRoundIdRef.current !== roundId) {
      currentRoundIdRef.current = roundId;
      previousRowCountsRef.current = {};
      setRevealingBoards([]);
      return;
    }

    const previousCounts = previousRowCountsRef.current;
    const nextCounts: Record<number, number> = {};
    const changedBoards: number[] = [];

    const safeBoards = Array.isArray(boards) ? boards : [];
    for (const board of safeBoards) {
      if (!board) continue;
      const rowCount = Array.isArray(board.rows) ? board.rows.length : 0;
      nextCounts[board.boardIndex] = rowCount;

      if (rowCount > (previousCounts[board.boardIndex] ?? 0)) {
        changedBoards.push(board.boardIndex);
      }
    }

    previousRowCountsRef.current = nextCounts;

    if (changedBoards.length > 0) {
      setRevealingBoards(changedBoards);
    }
  }, [boards, roundId]);

  return revealingBoards;
}
