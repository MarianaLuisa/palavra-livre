import { WEEKDAY_LABELS } from "../config";
import type { ProgressDay } from "../types";

type MonthCalendarProps = {
  /** Primeiro dia do mês, AAAA-MM-DD. */
  month: string;
  daysInMonth: number;
  /** Hoje no fuso oficial, vindo do servidor. */
  today: string;
  days: ProgressDay[];
  championshipDays: string[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
};

type DayState = "played" | "played-championship" | "missed" | "future";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Dia da semana com segunda = 0, para o calendário começar na segunda. */
function weekdayIndex(isoDate: string): number {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return (date.getUTCDay() + 6) % 7;
}

function buildDate(month: string, day: number): string {
  return `${month.slice(0, 7)}-${pad(day)}`;
}

export function MonthCalendar({
  month,
  daysInMonth,
  today,
  days,
  championshipDays,
  selectedDate,
  onSelectDate,
}: MonthCalendarProps) {
  const playedByDate = new Map(days.map((day) => [day.date, day]));
  const championshipSet = new Set(championshipDays);
  const leadingBlanks = weekdayIndex(buildDate(month, 1));

  function getState(date: string, day: ProgressDay | undefined): DayState {
    if (date > today) {
      return "future";
    }

    if (day === undefined) {
      return "missed";
    }

    return day.championship !== null ? "played-championship" : "played";
  }

  function describe(date: string, day: ProgressDay | undefined, state: DayState): string {
    const dayNumber = Number(date.slice(8, 10));

    if (state === "future") {
      return `Dia ${dayNumber}, ainda não chegou`;
    }

    if (day === undefined) {
      return championshipSet.has(date)
        ? `Dia ${dayNumber}, não jogou. Houve campeonato neste dia.`
        : `Dia ${dayNumber}, não jogou`;
    }

    const gamesText = `${day.games} ${day.games === 1 ? "partida" : "partidas"}`;
    const championshipText =
      day.championship === null ? "" : ", com participação no campeonato";

    return `Dia ${dayNumber}, ${gamesText}${championshipText}`;
  }

  return (
    <div className="calendar" role="group" aria-label="Calendário do mês">
      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <span key={`blank-${index}`} className="calendar-blank" aria-hidden="true" />
        ))}

        {Array.from({ length: daysInMonth }, (_, index) => {
          const dayNumber = index + 1;
          const date = buildDate(month, dayNumber);
          const day = playedByDate.get(date);
          const state = getState(date, day);
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const hasChampionshipToday = championshipSet.has(date);
          const clickable = day !== undefined;

          const className = [
            "calendar-day",
            `state-${state}`,
            isToday ? "is-today" : "",
            isSelected ? "is-selected" : "",
            hasChampionshipToday && day === undefined && state !== "future"
              ? "had-championship"
              : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={date}
              type="button"
              className={className}
              disabled={!clickable}
              aria-pressed={isSelected}
              aria-label={describe(date, day, state)}
              onClick={() => onSelectDate(isSelected ? null : date)}
            >
              <span className="calendar-day-number">{dayNumber}</span>
              {day !== undefined ? (
                <span className="calendar-day-count">{day.games}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <ul className="calendar-legend">
        <li>
          <span className="legend-swatch state-played" aria-hidden="true" />
          Jogou
        </li>
        <li>
          <span className="legend-swatch state-played-championship" aria-hidden="true" />
          Jogou e disputou o campeonato
        </li>
        <li>
          <span className="legend-swatch state-missed" aria-hidden="true" />
          Não jogou
        </li>
      </ul>
    </div>
  );
}
