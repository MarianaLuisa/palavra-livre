import { formatPosition, formatScore } from "../format";
import { getWeekDayColumns } from "../weeklyChampionshipDomain";
import type { LeaderboardEntry } from "../types";

type LeaderboardTableProps = {
  entries: LeaderboardEntry[];
  isFinal?: boolean;
  isWeekly?: boolean;
  weekStart?: string;
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
  if (left.position !== null && left.position !== undefined && right.position !== null && right.position !== undefined) {
    return left.position - right.position;
  }

  return (
    (right.totalScore ?? -1) - (left.totalScore ?? -1) ||
    (right.wordsSolved ?? -1) - (left.wordsSolved ?? -1) ||
    (right.completedRounds ?? 0) - (left.completedRounds ?? 0) ||
    (left.totalAttempts ?? Number.MAX_SAFE_INTEGER) -
      (right.totalAttempts ?? Number.MAX_SAFE_INTEGER) ||
    (left.totalDurationMs ?? Number.MAX_SAFE_INTEGER) -
      (right.totalDurationMs ?? Number.MAX_SAFE_INTEGER) ||
    (left.displayName ?? "").localeCompare(right.displayName ?? "", "pt-BR") ||
    (left.participantId ?? left.userId ?? "").localeCompare(right.participantId ?? right.userId ?? "")
  );
}

export function sortLeaderboardEntries<T extends LeaderboardEntry>(entries: T[]): T[] {
  return [...entries].sort(compareLeaderboardEntries);
}

export function LeaderboardTable({
  entries,
  isWeekly = false,
  weekStart,
  highlightParticipantId = null,
  emptyMessage = "Ninguém inscrito ainda.",
  totalWords = 13,
}: LeaderboardTableProps) {
  if (!entries || entries.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  const sortedEntries = sortLeaderboardEntries(entries);
  const weekStartIso =
    weekStart ??
    sortedEntries[0]?.days?.[0]?.date ??
    new Date().toISOString().slice(0, 10);
  const weekDayColumns = isWeekly ? getWeekDayColumns(weekStartIso) : [];

  return (
    <div className="table-scroll">
      <table className="leaderboard-table">
        <caption className="visually-hidden">Classificação dos participantes</caption>
        <thead>
          <tr>
            <th scope="col" style={{ width: "4.5rem", textAlign: "center" }}>Posição</th>
            <th scope="col" style={{ minWidth: "10rem", textAlign: "left" }}>Jogador</th>
            <th scope="col" style={{ width: "8.5rem", textAlign: "right" }}>
              {isWeekly ? "Pontuação Total" : "Pontuação da Rodada"}
            </th>
            {isWeekly ? (
              <>
                {weekDayColumns.map((col) => (
                  <th key={col.date} scope="col" style={{ width: "6.5rem", textAlign: "center" }}>
                    {col.headerLabel}
                  </th>
                ))}
                <th scope="col" style={{ width: "9rem", textAlign: "center" }}>Total Geral de Palavras</th>
              </>
            ) : (
              <th scope="col" style={{ width: "9rem", textAlign: "center" }}>Palavras Acertadas</th>
            )}
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry, index) => {
            const rowKey = entry.participantId ?? entry.userId ?? `entry-${index}-${entry.displayName}`;
            const isCurrentUser =
              highlightParticipantId !== null &&
              (entry.participantId === highlightParticipantId || entry.userId === highlightParticipantId);
            const position = entry.position ?? index + 1;

            return (
              <tr
                key={rowKey}
                className={getRowClassName(entry, isCurrentUser)}
                aria-current={isCurrentUser ? "true" : undefined}
              >
                <td style={{ textAlign: "center" }}>{formatPosition(position)}</td>
                <td style={{ textAlign: "left" }}>
                  <span className="player-name">{entry.displayName}</span>
                  {isCurrentUser ? <span className="you-badge">você</span> : null}
                </td>
                <td style={{ textAlign: "right" }}>
                  <strong>{formatScore(entry.totalScore)} pts</strong>
                </td>
                {isWeekly ? (
                  <>
                    {weekDayColumns.map((col) => {
                      const dayProgress =
                        entry.days?.find(
                          (d) =>
                            d.date === col.date ||
                            (typeof d.date === "string" && d.date.startsWith(col.date)) ||
                            d.weekday === col.weekday,
                        ) ??
                        (entry.dailyBreakdown?.[col.date]
                          ? {
                              played: entry.dailyBreakdown[col.date].played,
                              wordsSolved: entry.dailyBreakdown[col.date].wordsSolved,
                              wordsTotal: entry.dailyBreakdown[col.date].wordsTotal,
                            }
                          : null);

                      const played = Boolean(dayProgress?.played);
                      const words = dayProgress?.wordsSolved;
                      const wordsTotal = dayProgress?.wordsTotal ?? 13;

                      return (
                        <td key={col.date} style={{ textAlign: "center" }}>
                          {played && words !== null && words !== undefined ? (
                            <span className="daily-words-badge">
                              {words}/{wordsTotal}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: "center" }}>
                      <strong>
                        {entry.wordsSolved ?? 0}
                        {totalWords !== null ? `/${totalWords}` : "/65"}
                      </strong>
                    </td>
                  </>
                ) : (
                  <td style={{ textAlign: "center" }}>
                    <strong>
                      {entry.wordsSolved ?? 0}
                      {totalWords !== null ? `/${totalWords}` : ""}
                    </strong>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
