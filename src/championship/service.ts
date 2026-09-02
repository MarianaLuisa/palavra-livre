import {
  ChampionshipError,
  isDateTakenError,
  isMissingFunctionError,
  toChampionshipError,
} from "./errors";
import { getSupabaseClient, isChampionshipConfigured } from "./supabaseClient";
import { CHAMPIONSHIP_TIMEZONE } from "./config";
import { getZonedToday } from "./timezone";
import type { EvaluatedLetter, LetterStatus } from "../types/game";
import {
  getRoundId,
  type AdminOverview,
  type AdminPlayer,
  type AdminPlayerHistory,
  type AdminRoundAnswers,
  type ChampionshipBoard,
  type ChampionshipHistoryItem,
  type ChampionshipPlayerStats,
  type ChampionshipResults,
  type ChampionshipSchedule,
  type ChampionshipState,
  type ChampionshipStatus,
  type Leaderboard,
} from "./types";

type RpcRecord = Record<string, unknown>;

function record(value: unknown): RpcRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RpcRecord)
    : {};
}

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeLetter(letterValue: unknown): EvaluatedLetter {
  const item = record(letterValue);
  const letter = String(firstDefined(item.letter, item.char, item.letter_char, "") ?? "").toLowerCase();
  const statusRaw = String(firstDefined(item.status, item.letter_status, "empty") ?? "empty").toLowerCase();
  const status: LetterStatus =
    statusRaw === "correct" || statusRaw === "present" || statusRaw === "absent"
      ? statusRaw
      : "empty";

  return { letter, status };
}

function normalizeRow(rowValue: unknown): EvaluatedLetter[] {
  if (!Array.isArray(rowValue)) {
    return [];
  }
  return rowValue.map(normalizeLetter);
}

/**
 * Ensures no duplicate guesses appear on the same board.
 * In championship mode, each round accepts unique words only.
 */
export function deduplicateBoardRows(rows: EvaluatedLetter[][]): EvaluatedLetter[][] {
  const seen = new Set<string>();
  const unique: EvaluatedLetter[][] = [];

  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) continue;
    const word = row.map((item) => item.letter).join("").toLowerCase();
    if (!seen.has(word)) {
      seen.add(word);
      unique.push(row);
    }
  }

  return unique;
}

/** Converts both the current RPC shape and the legacy snake_case shape. */
function normalizeBoard(value: unknown, fallbackIndex: number): ChampionshipBoard {
  const board = record(value);
  const rawRows = firstDefined(board.rows, board.boardRows, board.board_rows, board.evaluations);
  const rows = deduplicateBoardRows(Array.isArray(rawRows) ? rawRows.map(normalizeRow) : []);

  return {
    boardIndex: Number(firstDefined(board.boardIndex, board.board_index, fallbackIndex)),
    solved: Boolean(firstDefined(board.solved, board.isSolved, board.is_solved, false)),
    answer: (firstDefined(board.answer, board.word, null) as string | null) ?? null,
    rows,
  };
}

export function normalizeChampionshipState(raw: unknown): ChampionshipState {
  const payload = record(raw);
  const rounds = Array.isArray(payload.rounds) ? payload.rounds : [];

  return {
    ...payload,
    rounds: rounds.map((value) => {
      const round = record(value);
      const participation = record(firstDefined(round.participation, round.participantRound, round.participant_round));
      const boardCount = Number(firstDefined(round.boardCount, round.board_count, 1));
      const rawBoards = firstDefined(
        round.boards,
        round.boardState,
        round.board_state,
        participation.boards,
        participation.boardState,
        participation.board_state,
      );
      const boards = Array.isArray(rawBoards)
        ? rawBoards.map((board, index) => normalizeBoard(board, index))
        : Array.from({ length: boardCount }, (_, index) => normalizeBoard({}, index));

      return {
        ...round,
        id: firstDefined(round.roundId, round.round_id, round.id, "") as string,
        roundId: firstDefined(round.roundId, round.round_id, round.id) as string | undefined,
        boardCount,
        maxAttempts: Number(firstDefined(round.maxAttempts, round.max_attempts, 0)),
        status: firstDefined(participation.status, round.status, "NOT_STARTED"),
        attemptsUsed: Number(firstDefined(participation.attemptsUsed, participation.attempts_used, round.attemptsUsed, round.attempts_used, 0)),
        wordsSolved: Number(firstDefined(participation.wordsSolved, participation.words_solved, round.wordsSolved, round.words_solved, 0)),
        allWordsSolved: Boolean(firstDefined(participation.allWordsSolved, participation.all_words_solved, round.allWordsSolved, round.all_words_solved, false)),
        baseScore: Number(firstDefined(participation.baseScore, participation.base_score, round.baseScore, round.base_score, 0)),
        bonusScore: Number(firstDefined(participation.bonusScore, participation.bonus_score, round.bonusScore, round.bonus_score, 0)),
        totalScore: Number(firstDefined(participation.totalScore, participation.total_score, round.totalScore, round.total_score, 0)),
        durationMs: Number(firstDefined(participation.durationMs, participation.duration_ms, round.durationMs, round.duration_ms, 0)),
        boards,
      };
    }),
  } as ChampionshipState;
}

/**
 * Rows are append-only. Retain rendered rows if the server temporarily returns
 * an empty response (e.g. during a transient reload or network glitch).
 */
export function preserveVisibleBoardRows(
  previous: ChampionshipState | null,
  next: ChampionshipState,
): ChampionshipState {
  if (previous === null || previous.championship?.id !== next.championship?.id) {
    return next;
  }

  const previousState = previous;
  const previousRounds = new Map(previousState.rounds.map((round) => [getRoundId(round), round]));
  const rounds = next.rounds.map((nextRound) => {
    const previousRound = previousRounds.get(getRoundId(nextRound));
    if (previousRound === undefined) {
      return nextRound;
    }

    const previousBoards = new Map(previousRound.boards.map((board) => [board.boardIndex, board]));
    const boards: ChampionshipBoard[] = nextRound.boards.map((nextBoard) => {
      const previousBoard = previousBoards.get(nextBoard.boardIndex);
      if (previousBoard === undefined) {
        return nextBoard;
      }
      if (nextBoard.rows.length === 0 && previousBoard.rows.length > 0) {
        return {
          ...nextBoard,
          rows: previousBoard.rows,
          solved: previousBoard.solved || nextBoard.solved,
          answer: nextBoard.answer ?? previousBoard.answer,
        };
      }
      return {
        ...nextBoard,
        solved: nextBoard.solved || previousBoard.solved,
        answer: nextBoard.answer ?? previousBoard.answer,
      };
    });

    for (const previousBoard of previousRound.boards) {
      if (!boards.some((board) => board.boardIndex === previousBoard.boardIndex)) {
        boards.push(previousBoard);
      }
    }
    boards.sort((left, right) => left.boardIndex - right.boardIndex);

    return {
      ...nextRound,
      boardCount: Math.max(nextRound.boardCount, previousRound.boardCount),
      maxAttempts: nextRound.maxAttempts || previousRound.maxAttempts,
      boards,
    };
  });

  return { ...next, rounds };
}

function mergeRoundBoards(state: ChampionshipState, roundId: string, rawBoards: unknown): ChampionshipState {
  if (!Array.isArray(rawBoards)) {
    return state;
  }

  return {
    ...state,
    rounds: state.rounds.map((round) => {
      if (getRoundId(round) !== roundId && round.id !== roundId && round.roundId !== roundId) {
        return round;
      }

      const incomingBoards = rawBoards.map((board, index) => normalizeBoard(board, index));
      const existingBoardsMap = new Map((round.boards ?? []).map((b) => [b.boardIndex, b]));
      const mergedBoards = incomingBoards.map((inc) => {
        const prev = existingBoardsMap.get(inc.boardIndex);
        if (prev && inc.rows.length === 0 && prev.rows.length > 0) {
          return {
            ...inc,
            rows: prev.rows,
            solved: inc.solved || prev.solved,
            answer: inc.answer ?? prev.answer,
          };
        }
        return {
          ...inc,
          solved: inc.solved || (prev?.solved ?? false),
          answer: inc.answer ?? prev?.answer ?? null,
        };
      });

      return {
        ...round,
        boards: mergedBoards,
      };
    }),
  };
}

export type CreateChampionshipInput = {
  championshipDate?: string;
  registrationOpensAt?: string;
  registrationClosesAt?: string;
  startsAt?: string;
  name?: string;
};

/**
 * Contrato unico de acesso ao backend do campeonato.
 * O restante do frontend so conhece esta interface, o que permite
 * trocar a implementacao (Supabase, motor local de testes) sem tocar na UI.
 */
export interface ChampionshipService {
  isConfigured(): boolean;
  isAuthenticated(): boolean;
  signIn(displayName: string): Promise<void>;
  signOut(): void;

  getState(championshipId?: string): Promise<ChampionshipState>;
  register(displayName: string, championshipId?: string): Promise<ChampionshipState>;
  cancelRegistration(championshipId?: string): Promise<ChampionshipState>;
  abandon(championshipId?: string): Promise<ChampionshipState>;
  startRound(roundId: string): Promise<ChampionshipState>;
  submitAttempt(roundId: string, word: string): Promise<ChampionshipState>;

  getLeaderboard(championshipId?: string): Promise<Leaderboard>;
  getWeeklyLeaderboard(weekStart?: string): Promise<Leaderboard>;
  getResults(championshipId?: string): Promise<ChampionshipResults>;
  getHistory(limit?: number, offset?: number): Promise<ChampionshipHistoryItem[]>;
  getPlayerStats(): Promise<ChampionshipPlayerStats>;

  getAdminOverview(championshipId?: string): Promise<AdminOverview>;
  createChampionship(input?: CreateChampionshipInput): Promise<{ championshipId: string }>;
  /** Cria na proxima data sem campeonato oficial ativo, a partir de hoje. */
  createNextChampionship(): Promise<CreateNextChampionshipResult>;
  setChampionshipStatus(championshipId: string, status: ChampionshipStatus): Promise<void>;
  redrawWords(championshipId: string): Promise<{ wordsDrawn: number }>;
  recalculateRanking(championshipId: string): Promise<void>;
  updateSchedule(
    championshipId: string,
    schedule: {
      registrationOpensAt?: string;
      registrationClosesAt?: string;
      startsAt?: string;
    },
  ): Promise<void>;

  // ---- Controles do painel administrativo -------------------------------
  /** Antecipa o inicio para agora. Idempotente. Preserva palavras e inscritos. */
  startChampionshipNow(championshipId: string): Promise<StartNowResult>;
  /** Grava os tres horarios. Recebe instantes absolutos em ISO 8601. */
  updateChampionshipSchedule(
    championshipId: string,
    schedule: ChampionshipSchedule,
  ): Promise<void>;
  openRegistrationNow(championshipId: string): Promise<void>;
  closeRegistrationNow(championshipId: string): Promise<void>;
  scheduleStartIn(championshipId: string, minutes: number): Promise<void>;
  cancelChampionship(championshipId: string): Promise<void>;
  finishChampionship(championshipId: string): Promise<void>;
  /** Respostas do campeonato. Só responde depois do encerramento. */
  getChampionshipAnswers(championshipId: string): Promise<AdminRoundAnswers[]>;
  /** Contas cadastradas com o resumo de atividade. Nunca devolve e-mail. */
  listPlayers(): Promise<AdminPlayer[]>;
  /** Histórico de um jogador: Jogo Livre e campeonato na mesma linha do tempo. */
  getPlayerGames(userId: string, limit?: number, offset?: number): Promise<AdminPlayerHistory>;
}

export type CreateNextChampionshipResult = {
  championshipId: string;
  championshipDate: string;
  startsAt: string;
  /** A data escolhida e a de hoje. */
  isToday: boolean;
  /** Quantos dias a frente ficou, quando hoje ja estava ocupado. */
  daysAhead: number;
  wordsDrawn?: number;
};

export type StartNowResult = {
  championshipId: string;
  status: ChampionshipStatus;
  startsAt: string;
  registrationClosesAt: string;
  alreadyStarted: boolean;
  participantCount?: number;
  answerCount?: number;
};

/** Soma dias a uma data AAAA-MM-DD sem sair do calendario civil. */
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function requireClient() {
  const client = getSupabaseClient();

  if (client === null) {
    throw new ChampionshipError("NOT_CONFIGURED");
  }

  return client;
}

export class SupabaseChampionshipService implements ChampionshipService {
  isConfigured(): boolean {
    return isChampionshipConfigured();
  }

  isAuthenticated(): boolean {
    return getSupabaseClient()?.isAuthenticated() ?? false;
  }

  async signIn(displayName: string): Promise<void> {
    const client = requireClient();

    if (!client.isAuthenticated()) {
      await client.signInAnonymously(displayName);
    }

    await client.rpc("cd_upsert_profile", { p_display_name: displayName });
  }

  signOut(): void {
    getSupabaseClient()?.signOut();
  }

  async getState(championshipId?: string): Promise<ChampionshipState> {
    const raw = await requireClient().rpc<unknown>("cd_get_state", {
      p_championship_id: championshipId ?? null,
    });
    const state = normalizeChampionshipState(raw);

    if (state.championship === null || state.championship === undefined) {
      throw new ChampionshipError("CHAMPIONSHIP_NOT_FOUND");
    }

    // The dedicated RPC reads the append-only attempt log. It protects the
    // board UI while older cd_build_state versions are still cached remotely.
    const hydrated = await Promise.all(
      state.rounds.map(async (round) => {
        try {
          const boardState = await requireClient().rpc<unknown>("cd_my_round_boards", {
            p_round_id: round.id,
          });
          return { roundId: round.id, boards: record(boardState).boards };
        } catch {
          // The main state is still usable before the additive migration lands.
          return null;
        }
      }),
    );

    return hydrated.reduce(
      (nextState, item) =>
        item === null ? nextState : mergeRoundBoards(nextState, item.roundId, item.boards),
      state,
    );
  }

  async register(displayName: string, championshipId?: string): Promise<ChampionshipState> {
    await this.signIn(displayName);
    return requireClient().rpc<ChampionshipState>("cd_register", {
      p_display_name: displayName,
      p_championship_id: championshipId ?? null,
    });
  }

  cancelRegistration(championshipId?: string): Promise<ChampionshipState> {
    return requireClient().rpc<ChampionshipState>("cd_cancel_registration", {
      p_championship_id: championshipId ?? null,
    });
  }

  abandon(championshipId?: string): Promise<ChampionshipState> {
    return requireClient().rpc<ChampionshipState>("cd_abandon_championship", {
      p_championship_id: championshipId ?? null,
    });
  }

  async startRound(roundId: string): Promise<ChampionshipState> {
    const state = await requireClient().rpc<ChampionshipState>("cd_start_round", { p_round_id: roundId });
    return this.getState(state?.championship?.id);
  }

  async submitAttempt(roundId: string, word: string): Promise<ChampionshipState> {
    const cleanWord = word.trim();
    // The PostgreSQL function accepts exactly p_round_id and p_word.
    // Sending p_guess too makes PostgREST fail function resolution.
    const rpcState = await requireClient().rpc<unknown>("cd_submit_attempt", {
      p_round_id: roundId,
      p_word: cleanWord,
    });

    const attemptState = normalizeChampionshipState(rpcState);

    // Refresh state and hydrate board state from append-only attempt logs
    try {
      const refreshed = await this.getState(attemptState?.championship?.id);
      return preserveVisibleBoardRows(attemptState, refreshed);
    } catch {
      return attemptState;
    }
  }

  getLeaderboard(championshipId?: string): Promise<Leaderboard> {
    return requireClient().rpc<Leaderboard>("cd_leaderboard", {
      p_championship_id: championshipId ?? null,
    });
  }

  getWeeklyLeaderboard(weekStart?: string): Promise<Leaderboard> {
    return requireClient().rpc<Leaderboard>("cd_weekly_leaderboard", {
      p_week_start: weekStart ?? null,
    });
  }

  getResults(championshipId?: string): Promise<ChampionshipResults> {
    return requireClient().rpc<ChampionshipResults>("cd_championship_results", {
      p_championship_id: championshipId ?? null,
    });
  }

  getHistory(limit = 20, offset = 0): Promise<ChampionshipHistoryItem[]> {
    return requireClient().rpc<ChampionshipHistoryItem[]>("cd_championship_history", {
      p_limit: limit,
      p_offset: offset,
    });
  }

  getPlayerStats(): Promise<ChampionshipPlayerStats> {
    return requireClient().rpc<ChampionshipPlayerStats>("cd_my_stats", {});
  }

  getAdminOverview(championshipId?: string): Promise<AdminOverview> {
    return requireClient().rpc<AdminOverview>("cd_admin_overview", {
      p_championship_id: championshipId ?? null,
    });
  }

  async createChampionship(
    input: CreateChampionshipInput = {},
  ): Promise<{ championshipId: string }> {
    const result = await requireClient().rpc<{ championshipId: string }>(
      "cd_admin_create_championship",
      {
        p_championship_date: input.championshipDate ?? null,
        p_registration_opens_at: input.registrationOpensAt ?? null,
        p_registration_closes_at: input.registrationClosesAt ?? null,
        p_starts_at: input.startsAt ?? null,
        p_name: input.name ?? null,
      },
    );

    return result;
  }

  /**
   * Cria na proxima data livre.
   *
   * Caminho preferido: cd_admin_create_next_championship, que resolve a
   * data no servidor numa transacao so.
   *
   * Se essa funcao ainda nao existir no banco (migration 13 pendente),
   * cai para a versao antiga e procura a data livre daqui, tentando
   * dia a dia. Assim o botao funciona antes e depois do deploy.
   */
  async createNextChampionship(): Promise<CreateNextChampionshipResult> {
    try {
      return await requireClient().rpc<CreateNextChampionshipResult>(
        "cd_admin_create_next_championship",
        {},
      );
    } catch (caughtError) {
      const error = toChampionshipError(caughtError);

      if (!isMissingFunctionError(error.server)) {
        throw error;
      }

      console.warn(
        "[admin] cd_admin_create_next_championship ausente; usando o caminho antigo. " +
          "Aplique as migrations pendentes com supabase db push.",
      );

      return this.createNextChampionshipFallback();
    }
  }

  /** Procura a data livre no cliente, tentando criar dia a dia. */
  private async createNextChampionshipFallback(): Promise<CreateNextChampionshipResult> {
    const today = await this.resolveToday();
    let lastError: unknown = null;

    for (let daysAhead = 0; daysAhead <= 60; daysAhead += 1) {
      const date = addDays(today, daysAhead);

      try {
        const created = await this.createChampionship({ championshipDate: date });

        return {
          championshipId: created.championshipId,
          championshipDate: date,
          startsAt: "",
          isToday: daysAhead === 0,
          daysAhead,
        };
      } catch (caughtError) {
        lastError = caughtError;

        // Data ocupada: tenta a proxima. Qualquer outro erro para aqui.
        if (!isDateTakenError(caughtError)) {
          throw toChampionshipError(caughtError);
        }
      }
    }

    console.error("[admin] nenhuma data livre encontrada", lastError);
    throw new ChampionshipError("NO_FREE_CHAMPIONSHIP_DATE", lastError);
  }

  /**
   * Data de hoje no fuso do campeonato.
   * Prefere o relogio do servidor; so cai no do dispositivo se a visao
   * administrativa nao estiver disponivel.
   */
  private async resolveToday(): Promise<string> {
    try {
      const overview = await this.getAdminOverview();

      if (typeof overview.today === "string" && overview.today.length === 10) {
        return overview.today;
      }
    } catch (caughtError) {
      console.warn("[admin] sem horario do servidor; usando o do dispositivo", caughtError);
    }

    return getZonedToday(new Date().toISOString(), CHAMPIONSHIP_TIMEZONE);
  }

  async setChampionshipStatus(
    championshipId: string,
    status: ChampionshipStatus,
  ): Promise<void> {
    await requireClient().rpc("cd_admin_set_status", {
      p_championship_id: championshipId,
      p_status: status,
    });
  }

  redrawWords(championshipId: string): Promise<{ wordsDrawn: number }> {
    return requireClient().rpc<{ wordsDrawn: number }>("cd_admin_redraw_words", {
      p_championship_id: championshipId,
    });
  }

  async recalculateRanking(championshipId: string): Promise<void> {
    await requireClient().rpc("cd_admin_recalculate", { p_championship_id: championshipId });
  }

  async updateSchedule(
    championshipId: string,
    schedule: {
      registrationOpensAt?: string;
      registrationClosesAt?: string;
      startsAt?: string;
    },
  ): Promise<void> {
    await requireClient().rpc("cd_admin_update_schedule", {
      p_championship_id: championshipId,
      p_registration_opens_at: schedule.registrationOpensAt ?? null,
      p_registration_closes_at: schedule.registrationClosesAt ?? null,
      p_starts_at: schedule.startsAt ?? null,
    });
  }

  // ---- Controles do painel administrativo -------------------------------

  startChampionshipNow(championshipId: string): Promise<StartNowResult> {
    return requireClient().rpc<StartNowResult>("cd_admin_start_championship_now", {
      p_championship_id: championshipId,
    });
  }

  async updateChampionshipSchedule(
    championshipId: string,
    schedule: ChampionshipSchedule,
  ): Promise<void> {
    await requireClient().rpc("cd_admin_update_championship_schedule", {
      p_championship_id: championshipId,
      p_registration_opens_at: schedule.registrationOpensAt,
      p_registration_closes_at: schedule.registrationClosesAt,
      p_starts_at: schedule.startsAt,
    });
  }

  async openRegistrationNow(championshipId: string): Promise<void> {
    await requireClient().rpc("cd_admin_open_registration_now", {
      p_championship_id: championshipId,
    });
  }

  async closeRegistrationNow(championshipId: string): Promise<void> {
    await requireClient().rpc("cd_admin_close_registration_now", {
      p_championship_id: championshipId,
    });
  }

  async scheduleStartIn(championshipId: string, minutes: number): Promise<void> {
    await requireClient().rpc("cd_admin_schedule_start_in", {
      p_championship_id: championshipId,
      p_minutes: minutes,
    });
  }

  async cancelChampionship(championshipId: string): Promise<void> {
    await requireClient().rpc("cd_admin_cancel_championship", {
      p_championship_id: championshipId,
    });
  }

  async finishChampionship(championshipId: string): Promise<void> {
    await requireClient().rpc("cd_admin_finish_championship", {
      p_championship_id: championshipId,
    });
  }

  getChampionshipAnswers(championshipId: string): Promise<AdminRoundAnswers[]> {
    return requireClient().rpc<AdminRoundAnswers[]>("cd_admin_championship_answers", {
      p_championship_id: championshipId,
    });
  }

  listPlayers(): Promise<AdminPlayer[]> {
    return requireClient().rpc<AdminPlayer[]>("cd_admin_list_players", {});
  }

  getPlayerGames(userId: string, limit = 40, offset = 0): Promise<AdminPlayerHistory> {
    return requireClient().rpc<AdminPlayerHistory>("cd_admin_player_games", {
      p_user_id: userId,
      p_limit: limit,
      p_offset: offset,
    });
  }
}

let defaultService: ChampionshipService | null = null;

export function getChampionshipService(): ChampionshipService {
  if (defaultService === null) {
    defaultService = new SupabaseChampionshipService();
  }

  return defaultService;
}

/** Permite injetar outra implementacao (testes, modo demonstracao). */
export function setChampionshipService(service: ChampionshipService | null): void {
  defaultService = service;
}
