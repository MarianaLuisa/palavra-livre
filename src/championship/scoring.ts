import { CHAMPIONSHIP_SCORING } from "./config";

export type RoundScoreInput = {
  wordsSolved: number;
  totalWords: number;
  attemptsUsed: number;
  maxAttempts: number;
};

export type RoundScore = {
  baseScore: number;
  bonusScore: number;
  totalScore: number;
  attemptsLeft: number;
  allWordsSolved: boolean;
};

export type ScoringRules = {
  pointsPerWord: number;
  bonusPerRemainingAttempt: number;
};

/**
 * Pontuacao de uma modalidade.
 *
 *   pontuacao = palavrasResolvidas * 100
 *   se resolveu todas: pontuacao += tentativasRestantes * 10
 *
 * Espelha cd_calculate_round_score no banco. O servidor continua sendo a
 * autoridade; esta funcao existe para exibicao, simulacao e testes.
 */
export function calculateRoundScore(
  input: RoundScoreInput,
  rules: ScoringRules = CHAMPIONSHIP_SCORING,
): RoundScore {
  const { wordsSolved, totalWords, attemptsUsed, maxAttempts } = input;

  if (
    !Number.isInteger(wordsSolved) ||
    !Number.isInteger(totalWords) ||
    wordsSolved < 0 ||
    totalWords < 0 ||
    wordsSolved > totalWords
  ) {
    throw new Error("Entrada inválida para o cálculo de pontuação.");
  }

  const attemptsLeft = Math.max(maxAttempts - attemptsUsed, 0);
  const allWordsSolved = totalWords > 0 && wordsSolved === totalWords;
  const baseScore = wordsSolved * rules.pointsPerWord;
  const bonusScore = allWordsSolved
    ? attemptsLeft * rules.bonusPerRemainingAttempt
    : 0;

  return {
    baseScore,
    bonusScore,
    totalScore: baseScore + bonusScore,
    attemptsLeft,
    allWordsSolved,
  };
}

/** Soma das pontuacoes das modalidades disputadas. */
export function calculateChampionshipScore(
  rounds: RoundScoreInput[],
  rules: ScoringRules = CHAMPIONSHIP_SCORING,
): RoundScore & { rounds: RoundScore[] } {
  const scoredRounds = rounds.map((round) => calculateRoundScore(round, rules));

  return {
    rounds: scoredRounds,
    baseScore: scoredRounds.reduce((total, round) => total + round.baseScore, 0),
    bonusScore: scoredRounds.reduce((total, round) => total + round.bonusScore, 0),
    totalScore: scoredRounds.reduce((total, round) => total + round.totalScore, 0),
    attemptsLeft: scoredRounds.reduce((total, round) => total + round.attemptsLeft, 0),
    allWordsSolved: scoredRounds.every((round) => round.allWordsSolved),
  };
}
