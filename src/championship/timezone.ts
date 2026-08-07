import { CHAMPIONSHIP_TIMEZONE } from "./config";

/**
 * Conversao entre horario de parede (o que a administradora digita) e
 * instantes absolutos (o que o banco armazena em timestamptz).
 *
 * O painel administrativo mostra e recebe horarios de America/Sao_Paulo,
 * mas envia sempre ISO 8601 com fuso explicito. Nenhuma conversao manual
 * de UTC para Brasilia acontece na mao.
 *
 * O relogio do dispositivo nao e usado para decidir nada: ele so participa
 * do calculo de offset da zona, que independe da hora local da maquina.
 */

export type ZonedDateTime = {
  /** AAAA-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
};

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone);

  if (cached !== undefined) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  partsFormatterCache.set(timeZone, formatter);
  return formatter;
}

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function readWallClock(instant: Date, timeZone: string): WallClock {
  const parts = getPartsFormatter(timeZone).formatToParts(instant);
  const values: Record<string, number> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year ?? 0,
    month: values.month ?? 1,
    day: values.day ?? 1,
    // Alguns motores devolvem 24 para meia-noite mesmo com hourCycle h23.
    hour: (values.hour ?? 0) % 24,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

/** Offset da zona, em milissegundos, para um instante especifico. */
function getZoneOffsetMs(instant: Date, timeZone: string): number {
  const wall = readWallClock(instant, timeZone);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );

  // Segundos e abaixo do segundo nao importam para o offset.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** Quebra um instante ISO nos campos de data e hora daquela zona. */
export function toZonedDateTime(
  isoInstant: string | null | undefined,
  timeZone: string = CHAMPIONSHIP_TIMEZONE,
): ZonedDateTime | null {
  if (isoInstant === null || isoInstant === undefined) {
    return null;
  }

  const instant = new Date(isoInstant);

  if (Number.isNaN(instant.getTime())) {
    return null;
  }

  const wall = readWallClock(instant, timeZone);

  return {
    date: `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}`,
    time: `${pad(wall.hour)}:${pad(wall.minute)}`,
  };
}

/**
 * Converte data e hora de parede daquela zona para um instante ISO em UTC.
 *
 * Faz duas passagens porque o offset depende do proprio instante: perto de
 * uma virada de horario de verao, a primeira estimativa pode cair do lado
 * errado da transicao. O Brasil nao usa mais horario de verao, mas a funcao
 * fica correta para qualquer zona.
 */
export function fromZonedDateTime(
  date: string,
  time: string,
  timeZone: string = CHAMPIONSHIP_TIMEZONE,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Data ou hora invalida.");
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  if (hour > 23 || minute > 59) {
    throw new Error("Data ou hora invalida.");
  }

  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  let offset = getZoneOffsetMs(new Date(wallAsUtc), timeZone);
  let instant = wallAsUtc - offset;

  offset = getZoneOffsetMs(new Date(instant), timeZone);
  instant = wallAsUtc - offset;

  return new Date(instant).toISOString();
}

/** Data de hoje (AAAA-MM-DD) naquela zona, a partir do horario do servidor. */
export function getZonedToday(
  serverNowIso: string,
  timeZone: string = CHAMPIONSHIP_TIMEZONE,
): string {
  return toZonedDateTime(serverNowIso, timeZone)?.date ?? "";
}

/** Soma minutos a um instante e devolve o resultado em ISO. */
export function addMinutesToIso(isoInstant: string, minutes: number): string {
  return new Date(new Date(isoInstant).getTime() + minutes * 60_000).toISOString();
}
