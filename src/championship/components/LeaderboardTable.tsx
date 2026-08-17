import { PARTICIPATION_STATUS_LABEL } from "../config";
import { formatDuration, formatPosition, formatScore } from "../format";
import type { LeaderboardEntry } from "../types";

type LeaderboardTableProps = {
  entries: LeaderboardEntry[];
  isFinal: boolean;
  highlightParticipantId?: string | null;
  emptyMessage?: string;
  totalWords?: number | null;
  totalRounds?: number | null;
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

function compareLeaderboardEntries(left: LeaderboardEntry, right: LeaderboardEntry): number {
  if (left.position !== null || right.position !== null) {
    return (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER);
  }

  return (
    (right.totalScore ?? -1) - (left.totalScore ?? -1) ||
    (right.wordsSolved ?? -1) - (left.wordsSolved ?? -1) ||
    right.completedRounds - left.completedRounds ||
    (left.totalAttempts ?? Number.MAX_SAFE_INTEGER) -
      (right.totalAttempts ?? Number.MAX_SAFE_INTEGER) ||
    (left.totalDurationMs ?? Number.MAX_SAFE_INTEGER) -
      (right.totalDurationMs ?? Number.MAX_SAFE_INTEGER) ||
    left.displayName.localeCompare(right.displayName, "pt-BR") ||
    left.participantId.localeCompare(right.participantId)
  );
}

export function sortLeaderboardEntries<T extends LeaderboardEntry>(entries: T[]): T[] {
  return [...entries].sort(compareLeaderboardEntries);
}

export function LeaderboardTable({
  entries,
  isFinal,
  highlightParticipantId = null,
  emptyMessage = "Ninguém inscrito ainda.",
  totalWords = 13,
  totalRounds = 4,
}: LeaderboardTableProps) {
  if (entries.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  const sortedEntries = sortLeaderboardEntries(entries);

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
          {sortedEntries.map((entry, index) => {
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
                    <td>
                      {entry.wordsSolved ?? "-"}
                      {totalWords !== null ? `/${totalWords}` : ""}
                    </td>
                    <td>
                      {entry.completedRounds}
                      {totalRounds !== null ? `/${totalRounds}` : ""}
                    </td>
                    <td>{entry.totalAttempts ?? "-"}</td>
                    <td>{formatDuration(entry.totalDurationMs)}</td>
                  </>
                ) : (
                  <td>
                    {entry.completedRounds}
                    {totalRounds !== null ? `/${totalRounds}` : ""}
                  </td>
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
