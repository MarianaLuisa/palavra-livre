import type { GameMode } from "../types/game";
import { GAME_MODE_TO_CHAMPIONSHIP_MODE } from "../championship/types";
import type { RecordGameInput } from "./types";

/**
 * Fila local de partidas ainda nao confirmadas pelo servidor.
 *
 * Se a rede cair no momento em que a partida termina, o resultado nao se
 * perde: fica aqui e e reenviado na proxima abertura. Como o registro no
 * servidor e idempotente pelo clientGameId, reenviar e sempre seguro.
 */
const PENDING_GAMES_KEY = "palavra-livre:pending-games";
const MAX_PENDING_GAMES = 50;

export type PendingGame = RecordGameInput & { queuedAt: string };

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadPendingGames(): PendingGame[] {
  const storage = getStorage();

  if (storage === null) {
    return [];
  }

  try {
    const raw = storage.getItem(PENDING_GAMES_KEY);

    if (raw === null) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item): item is PendingGame =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as PendingGame).clientGameId === "string" &&
        typeof (item as PendingGame).mode === "string",
    );
  } catch {
    return [];
  }
}

function savePendingGames(games: PendingGame[]): void {
  const storage = getStorage();

  if (storage === null) {
    return;
  }

  storage.setItem(PENDING_GAMES_KEY, JSON.stringify(games.slice(-MAX_PENDING_GAMES)));
}

export function queuePendingGame(input: RecordGameInput): void {
  const pending = loadPendingGames();

  if (pending.some((item) => item.clientGameId === input.clientGameId)) {
    return;
  }

  savePendingGames([...pending, { ...input, queuedAt: new Date().toISOString() }]);
}

export function removePendingGame(clientGameId: string): void {
  savePendingGames(
    loadPendingGames().filter((item) => item.clientGameId !== clientGameId),
  );
}

export function clearPendingGames(): void {
  const storage = getStorage();
  storage?.removeItem(PENDING_GAMES_KEY);
}

/** Identificador de partida. Criado quando a partida comeca. */
export function createClientGameId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback para ambientes sem crypto.randomUUID.
  return `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Traduz o resultado de uma partida do Jogo Livre para o formato do servidor. */
export function buildRecordGameInput(params: {
  clientGameId: string;
  mode: GameMode;
  attemptsUsed: number;
  wordsSolved: number;
  startedAt: string | null;
  finishedAt?: string;
}): RecordGameInput {
  const startedAtMs =
    params.startedAt === null ? null : Date.parse(params.startedAt);
  const finishedAtMs = Date.parse(params.finishedAt ?? new Date().toISOString());
  const durationMs =
    startedAtMs === null || Number.isNaN(startedAtMs)
      ? 0
      : Math.max(finishedAtMs - startedAtMs, 0);

  return {
    clientGameId: params.clientGameId,
    mode: GAME_MODE_TO_CHAMPIONSHIP_MODE[params.mode],
    attemptsUsed: params.attemptsUsed,
    wordsSolved: params.wordsSolved,
    durationMs,
    startedAt: params.startedAt,
  };
}
