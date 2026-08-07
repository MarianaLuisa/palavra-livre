import { PARTICIPATION_STATUS_LABEL } from "../config";
import { formatDuration, formatPosition, formatScore } from "../format";
import type { LeaderboardEntry } from "../types";

type LeaderboardTableProps = {
  entries: LeaderboardEntry[];
  isFinal: boolean;
  highlightParticipantId?: string | null;
  emptyMessage?: string;
};

function getRowClassName(entry: LeaderboardEntry, isCurrentUser: boolean): string {
  return [
    "leaderboard-row",
    entry.position === 1 ? "first" : "",
    entry.position === 2 ? "second" : "",
    entry.position === 3 ? "third" : "",
    isCurrentUser ? "current-user" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function LeaderboardTable({
  entries,
  isFinal,
  highlightParticipantId = null,
  emptyMessage = "Ninguém inscrito ainda.",
}: LeaderboardTableProps) {
  if (entries.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <div className="table-scroll">
      <table className="leaderboard-table">
        <caption className="visually-hidden">
          {isFinal
            ? "Classificação final do campeonato"
            : "Lista parcial de participantes. Os detalhes aparecem no encerramento."}
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Participante</th>
            {isFinal ? (
              <>
                <th scope="col">Pontos</th>
                <th scope="col">Palavras</th>
                <th scope="col">Modalidades</th>
                <th scope="col">Tentativas</th>
                <th scope="col">Tempo</th>
              </>
            ) : (
              <th scope="col">Modalidades</th>
            )}
            <th scope="col">Situação</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const isCurrentUser = entry.participantId === highlightParticipantId;

            return (
              <tr
                key={entry.participantId}
                className={getRowClassName(entry, isCurrentUser)}
                aria-current={isCurrentUser ? "true" : undefined}
              >
                <td>{isFinal ? formatPosition(entry.position ?? index + 1) : index + 1}</td>
                <td>
                  {entry.displayName}
                  {isCurrentUser ? <span className="you-badge">você</span> : null}
                </td>
                {isFinal ? (
                  <>
                    <td>{formatScore(entry.totalScore)}</td>
                    <td>{entry.wordsSolved ?? "-"}/13</td>
                    <td>{entry.completedRounds}/4</td>
                    <td>{entry.totalAttempts ?? "-"}</td>
                    <td>{formatDuration(entry.totalDurationMs)}</td>
                  </>
                ) : (
                  <td>{entry.completedRounds}/4</td>
                )}
                <td>{PARTICIPATION_STATUS_LABEL[entry.status] ?? entry.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
