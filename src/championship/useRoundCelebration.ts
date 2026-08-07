import { useEffect, useMemo, useRef, useState } from "react";
import { REVEAL_TOTAL_MS } from "../utils/constants";
import type {
  ChampionshipRoundState,
  ChampionshipState,
  ParticipantRoundStatus,
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

    const currentStatuses = new Map(state.rounds.map((round) => [round.id, round.status]));
    const previousStatuses = previousStatusesRef.current;
    previousStatusesRef.current = currentStatuses;

    // Primeira leitura da sessao: nao ha transicao para comemorar.
    if (previousStatuses === null) {
      return;
    }

    for (const round of state.rounds) {
      const before = previousStatuses.get(round.id);

      if (before !== undefined && !isClosed(before) && isClosed(round.status)) {
        setCelebratedRoundId(round.id);
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

    return state.rounds.find((item) => item.id === celebratedRoundId) ?? null;
  }, [celebratedRoundId, state]);

  return {
    round,
    visible,
    dismiss: () => setCelebratedRoundId(null),
  };
}
