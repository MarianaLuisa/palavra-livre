import { formatDuration, formatScore } from "../../championship/format";
import { MODE_LABEL_PT, MONTH_NAMES } from "../config";
import type { ProgressDay } from "../types";

type DayDetailProps = {
  day: ProgressDay;
  /** Houve campeonato oficial nesta data. */
  hadChampionship: boolean;
  onClose: () => void;
};

function formatDayTitle(date: string): string {
  const dayNumber = Number(date.slice(8, 10));
  const monthIndex = Number(date.slice(5, 7)) - 1;
  return `${dayNumber} de ${MONTH_NAMES[monthIndex] ?? ""}`;
}

/** Detalhe do dia clicado no calendário. Só mostra o que existe. */
export function DayDetail({ day, hadChampionship, onClose }: DayDetailProps) {
  const modeEntries = (Object.keys(day.byMode) as Array<keyof typeof day.byMode>)
    .filter((mode) => day.byMode[mode] > 0)
    .map((mode) => ({ mode, count: day.byMode[mode] }));

  return (
    <aside className="day-detail" aria-label={`Resumo de ${formatDayTitle(day.date)}`}>
      <header className="day-detail-header">
        <h3>{formatDayTitle(day.date)}</h3>
        <button
          className="ghost-button compact"
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhe do dia"
        >
          Fechar
        </button>
      </header>

      <dl className="day-detail-grid">
        <div>
          <dt>Partidas</dt>
          <dd>{day.games}</dd>
        </div>
        <div>
          <dt>Completas</dt>
          <dd>{day.completedGames}</dd>
        </div>
        <div>
          <dt>Palavras resolvidas</dt>
          <dd>{day.wordsSolved}</dd>
        </div>
        <div>
          <dt>Tentativas</dt>
          <dd>{day.attempts}</dd>
        </div>
        {day.durationMs > 0 ? (
          <div>
            <dt>Tempo</dt>
            <dd>{formatDuration(day.durationMs)}</dd>
          </div>
        ) : null}
      </dl>

      {modeEntries.length > 0 ? (
        <ul className="day-detail-modes">
          {modeEntries.map((entry) => (
            <li key={entry.mode}>
              <span>{MODE_LABEL_PT[entry.mode] ?? entry.mode}</span>
              <strong>{entry.count}</strong>
            </li>
          ))}
        </ul>
      ) : null}

      {day.championship !== null ? (
        <div className="day-detail-championship">
          <h4>Rodada diária do Campeonato Norte</h4>
          <p>
            {day.championship.position === null
              ? "Participou"
              : `${day.championship.position}º lugar`}
            {" · "}
            {formatScore(day.championship.totalScore)} pontos
            {" · "}
            {day.championship.wordsSolved}/13 palavras
          </p>
        </div>
      ) : hadChampionship ? (
        <p className="day-detail-championship muted">Não participou do campeonato.</p>
      ) : null}
    </aside>
  );
}
