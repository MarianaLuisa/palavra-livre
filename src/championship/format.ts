import { CHAMPIONSHIP_TIMEZONE } from "./config";

/**
 * Formatacao sempre no fuso oficial do campeonato.
 * O relogio do dispositivo nunca decide horarios: o servidor envia
 * instantes absolutos (ISO) e aqui apenas os apresentamos.
 */

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: CHAMPIONSHIP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: CHAMPIONSHIP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: CHAMPIONSHIP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function parse(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string | null | undefined): string {
  const parsed = parse(value);

  if (parsed === null) {
    // Datas puras (YYYY-MM-DD) chegam sem fuso.
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-");
      return `${day}/${month}/${year}`;
    }
    return "-";
  }

  return dateFormatter.format(parsed);
}

export function formatDateWithWeekday(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  let year: number;
  let month: number;
  let day: number;

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    [year, month, day] = value.split("-").map(Number);
  } else {
    const parsed = parse(value);
    if (parsed === null) return "-";
    const dateFormatted = dateFormatter.format(parsed); // "02/09/2026"
    [day, month, year] = dateFormatted.split("/").map(Number);
  }

  const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekdayName = new Intl.DateTimeFormat("pt-BR", {
    timeZone: CHAMPIONSHIP_TIMEZONE,
    weekday: "long",
  }).format(dateObj);

  const capitalized = weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1);
  return `${capitalized} (${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year})`;
}

export function formatTime(value: string | null | undefined): string {
  const parsed = parse(value);
  return parsed === null ? "-" : timeFormatter.format(parsed);
}

export function formatDateTime(value: string | null | undefined): string {
  const parsed = parse(value);
  return parsed === null ? "-" : dateTimeFormatter.format(parsed);
}

/** Duracao legivel: 1h 05min 20s, 5min 20s, 20s. */
export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined || durationMs <= 0) {
    return "-";
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}min`;
  }

  if (minutes > 0) {
    return `${minutes}min ${String(seconds).padStart(2, "0")}s`;
  }

  return `${seconds}s`;
}

/** Contagem regressiva no formato HH:MM:SS ou MM:SS. */
export function formatCountdown(remainingMs: number): string {
  const safeRemaining = Math.max(remainingMs, 0);
  const totalSeconds = Math.floor(safeRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
}

export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return "-";
  }

  return score.toLocaleString("pt-BR");
}

export function formatPosition(position: number | null | undefined): string {
  return position === null || position === undefined ? "-" : `${position}º`;
}
