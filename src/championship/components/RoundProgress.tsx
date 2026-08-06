import { CHAMPIONSHIP_MODE_LABEL } from "../config";
import type { ChampionshipRoundState } from "../types";

type RoundProgressProps = {
  rounds: ChampionshipRoundState[];
  currentRoundId: string | null;
};

const CLOSED_STATUSES = ["COMPLETED", "FAILED", "EXPIRED"];

export function RoundProgress({ rounds, currentRoundId }: RoundProgressProps) {
  return (
    <ol className="round-progress" aria-label="Ordem das modalidades">
      {rounds.map((round) => {
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
          <li key={round.id} className={className} aria-current={current ? "step" : undefined}>
            <span className="round-progress-order">{round.roundOrder}</span>
            <span className="round-progress-label">{CHAMPIONSHIP_MODE_LABEL[round.mode]}</span>
            <small>
              {closed
                ? `${round.wordsSolved}/${round.boardCount} palavras`
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
