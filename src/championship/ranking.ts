/**
 * Criterios de classificacao e desempate do Campeonato Diario.
 *
 * Ordem oficial:
 *   1. maior pontuacao total
 *   2. maior numero total de palavras descobertas
 *   3. maior numero de modalidades completamente concluidas
 *   4. menor quantidade total de tentativas utilizadas
 *   5. menor tempo total de jogo
 *   6. desempate tecnico: quem concluiu o campeonato primeiro
 *   7. desempate final determinista: identificador da participacao
 *
 * O tempo nunca e o criterio principal. Ele so entra depois de
 * pontuacao, palavras, modalidades concluidas e tentativas.
 *
 * Espelha exatamente cd_consolidate_ranking no banco.
 */
export type RankableParticipant = {
  participantId: string;
  totalScore: number;
  wordsSolved: number;
  completedRounds: number;
  totalAttempts: number;
  totalDurationMs: number;
  finishedAt: string | null;
};

export type RankedParticipant<T extends RankableParticipant> = T & {
  position: number;
};

function compareFinishedAt(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  // Quem nao concluiu vai para o fim (equivalente a 'infinity' no SQL).
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return Date.parse(left) - Date.parse(right);
}

export function compareParticipants(
  left: RankableParticipant,
  right: RankableParticipant,
): number {
  return (
    right.totalScore - left.totalScore ||
    right.wordsSolved - left.wordsSolved ||
    right.completedRounds - left.completedRounds ||
    left.totalAttempts - right.totalAttempts ||
    left.totalDurationMs - right.totalDurationMs ||
    compareFinishedAt(left.finishedAt, right.finishedAt) ||
    left.participantId.localeCompare(right.participantId)
  );
}

/** Ordena e atribui posicoes 1..N sem empates de posicao. */
export function rankParticipants<T extends RankableParticipant>(
  participants: T[],
): RankedParticipant<T>[] {
  return [...participants]
    .sort(compareParticipants)
    .map((participant, index) => ({ ...participant, position: index + 1 }));
}

export function getPodium<T extends RankableParticipant>(
  participants: T[],
): RankedParticipant<T>[] {
  return rankParticipants(participants).slice(0, 3);
}
