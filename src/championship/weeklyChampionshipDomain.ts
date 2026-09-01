export const BRAZIL_TIMEZONE = "America/Sao_Paulo";

export type WeekdayCode = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type RoundLabel = "SEGUNDA" | "TERCA" | "QUARTA" | "QUINTA" | "SEXTA";
export type CompetitionWeekday = 1 | 2 | 3 | 4 | 5;

export function getBrazilWeekStart(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  const isoDay: WeekdayCode = (date.getUTCDay() === 0 ? 7 : date.getUTCDay()) as WeekdayCode;
  date.setUTCDate(date.getUTCDate() - (isoDay - 1));
  return date.toISOString().slice(0, 10);
}

export function getBrazilWeekEnd(dateIso: string): string {
  const start = new Date(`${getBrazilWeekStart(dateIso)}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 4);
  return start.toISOString().slice(0, 10);
}

export function formatBrazilianDate(dateIso: string): string {
  const [year, month, day] = dateIso.slice(0, 10).split("-").map(Number);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function formatNorteWeekRange(weekStartIso: string, weekEndIso: string): string {
  return `${formatBrazilianDate(weekStartIso)} – ${formatBrazilianDate(weekEndIso)}`;
}

export function formatNorteWeekTitle(weekStartIso: string, weekEndIso: string): string {
  return `Campeonato Norte — ${formatBrazilianDate(weekStartIso)} a ${formatBrazilianDate(weekEndIso)}`;
}

export function formatWeekdayFullName(weekday: CompetitionWeekday | number): string {
  switch (weekday) {
    case 1:
      return "Segunda-feira";
    case 2:
      return "Terça-feira";
    case 3:
      return "Quarta-feira";
    case 4:
      return "Quinta-feira";
    case 5:
      return "Sexta-feira";
    default:
      return "";
  }
}

export function formatWeekdayShortName(weekday: CompetitionWeekday | number): string {
  switch (weekday) {
    case 1:
      return "Seg";
    case 2:
      return "Ter";
    case 3:
      return "Qua";
    case 4:
      return "Qui";
    case 5:
      return "Sex";
    default:
      return "";
  }
}

export type WeekDayColumnInfo = {
  date: string;
  weekday: number;
  dayShort: string;
  dateShort: string;
  headerLabel: string;
};

export function getWeekDayColumns(weekStartIso: string): WeekDayColumnInfo[] {
  const columns: WeekDayColumnInfo[] = [];
  const names = ["Seg", "Ter", "Qua", "Qui", "Sex"];
  for (let i = 0; i < 5; i++) {
    const d = new Date(`${weekStartIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayFormatted = `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
    columns.push({
      date: dateStr,
      weekday: i + 1,
      dayShort: names[i],
      dateShort: dayFormatted,
      headerLabel: `${names[i]} (${dayFormatted})`,
    });
  }
  return columns;
}

export function getBrazilWeekday(dateIso: string): CompetitionWeekday | null {
  const date = new Date(`${dateIso}T12:00:00Z`);
  const day: WeekdayCode = (date.getUTCDay() === 0 ? 7 : date.getUTCDay()) as WeekdayCode;

  if (day >= 1 && day <= 5) {
    return day as CompetitionWeekday;
  }

  return null;
}

export function getRoundLabelForDate(dateIso: string): RoundLabel | null {
  const weekday = getBrazilWeekday(dateIso);

  if (weekday === null) {
    return null;
  }

  switch (weekday) {
    case 1:
      return "SEGUNDA";
    case 2:
      return "TERCA";
    case 3:
      return "QUARTA";
    case 4:
      return "QUINTA";
    case 5:
      return "SEXTA";
    default:
      return null;
  }
}

export function isCompetitionDay(dateIso: string): boolean {
  return getBrazilWeekday(dateIso) !== null;
}

export function getCompetitionWeekRange(dateIso: string): { weekStart: string; weekEnd: string } {
  return {
    weekStart: getBrazilWeekStart(dateIso),
    weekEnd: getBrazilWeekEnd(dateIso),
  };
}
