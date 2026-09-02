import { CHAMPIONSHIP_MODE_LABEL } from "../config";
import type { ChampionshipRoundState } from "../types";

type RoundProgressProps = {
  rounds: ChampionshipRoundState[];
  currentRoundId: string | null;
};

const CLOSED_STATUSES = ["COMPLETED", "FAILED", "EXPIRED"];

export function RoundProgress({ rounds, currentRoundId }: RoundProgressProps) {
  const safeRounds = Array.isArray(rounds) ? rounds.filter(Boolean) : [];

  return (
    <ol className="round-progress" aria-label="Ordem das modalidades">
      {safeRounds.map((round, index) => {
        const closed = CLOSED_STATUSES.includes(round.status);
        const current = round.id === currentRoundId;
        const className = [
          "round-progress-item",
          closed ? "done" : "",
          current ? "current" : "",
          !closed && !current ? "locked" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <li
            key={round.id || `round-${round.roundOrder ?? index}`}
            className={className}
            aria-current={current ? "step" : undefined}
          >
            <span className="round-progress-order">{round.roundOrder ?? index + 1}</span>
            <span className="round-progress-label">
              {CHAMPIONSHIP_MODE_LABEL[round.mode] ?? round.mode}
            </span>
            <small>
              {closed
                ? `${round.wordsSolved ?? 0}/${round.boardCount ?? 1} palavras`
                : current
                  ? "Em andamento"
                  : "Bloqueada"}
            </small>
          </li>
        );
      })}
    </ol>
  );
}
