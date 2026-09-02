import { useEffect, useMemo, useRef, useState } from "react";
import { REVEAL_TOTAL_MS } from "../utils/constants";
import {
  getRoundId,
  type ChampionshipRoundState,
  type ChampionshipState,
  type ParticipantRoundStatus,
} from "./types";

const CLOSED_STATUSES: ParticipantRoundStatus[] = ["COMPLETED", "FAILED", "EXPIRED"];

function isClosed(status: ParticipantRoundStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

export type RoundCelebration = {
  /** Rodada recem-concluida, enquanto a comemoracao estiver ativa. */
  round: ChampionshipRoundState | null;
  /** O modal so aparece depois da animacao de revelacao terminar. */
  visible: boolean;
  dismiss: () => void;
};

/**
 * Detecta o instante em que uma modalidade e concluida.
 *
 * A deteccao compara o status ANTERIOR com o atual, entao so dispara numa
 * transicao observada nesta sessao. Recarregar a pagina com a modalidade
 * ja concluida nao reabre a comemoracao.
 */
export function useRoundCelebration(state: ChampionshipState | null): RoundCelebration {
  const [celebratedRoundId, setCelebratedRoundId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const previousStatusesRef = useRef<Map<string, ParticipantRoundStatus> | null>(null);

  useEffect(() => {
    if (state === null) {
      return;
    }

    const safeRounds = Array.isArray(state.rounds) ? state.rounds : [];
    const currentStatuses = new Map(safeRounds.map((round) => [getRoundId(round), round.status]));
    const previousStatuses = previousStatusesRef.current;
    previousStatusesRef.current = currentStatuses;

    // Primeira leitura da sessao: nao ha transicao para comemorar.
    if (previousStatuses === null) {
      return;
    }

    for (const round of safeRounds) {
      const roundId = getRoundId(round);
      const before = previousStatuses.get(roundId);

      if (before !== undefined && !isClosed(before) && isClosed(round.status)) {
        setCelebratedRoundId(roundId);
        return;
      }
    }
  }, [state]);

  // Espera a revelacao da ultima linha antes de cobrir o tabuleiro.
  useEffect(() => {
    if (celebratedRoundId === null) {
      setVisible(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setVisible(true), REVEAL_TOTAL_MS);
    return () => window.clearTimeout(timeoutId);
  }, [celebratedRoundId]);

  const round = useMemo(() => {
    if (celebratedRoundId === null || state === null) {
      return null;
    }

    const safeRounds = Array.isArray(state.rounds) ? state.rounds : [];
    return safeRounds.find((item) => getRoundId(item) === celebratedRoundId) ?? null;
  }, [celebratedRoundId, state]);

  return {
    round,
    visible,
    dismiss: () => setCelebratedRoundId(null),
  };
}
