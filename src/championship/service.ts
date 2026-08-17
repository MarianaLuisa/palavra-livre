import {
  ChampionshipError,
  isDateTakenError,
  isMissingFunctionError,
  toChampionshipError,
} from "./errors";
import { getSupabaseClient, isChampionshipConfigured } from "./supabaseClient";
import { CHAMPIONSHIP_TIMEZONE } from "./config";
import { getZonedToday } from "./timezone";
import type {
  AdminOverview,
  AdminPlayer,
  AdminPlayerHistory,
  AdminRoundAnswers,
  ChampionshipHistoryItem,
  ChampionshipPlayerStats,
  ChampionshipResults,
  ChampionshipSchedule,
  ChampionshipState,
  ChampionshipStatus,
  Leaderboard,
} from "./types";

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

  getState(championshipId?: string): Promise<ChampionshipState> {
    return requireClient().rpc<ChampionshipState>("cd_get_state", {
      p_championship_id: championshipId ?? null,
    });
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

  startRound(roundId: string): Promise<ChampionshipState> {
    return requireClient().rpc<ChampionshipState>("cd_start_round", { p_round_id: roundId });
  }

  submitAttempt(roundId: string, word: string): Promise<ChampionshipState> {
    return requireClient().rpc<ChampionshipState>("cd_submit_attempt", {
      p_round_id: roundId,
      p_word: word,
    });
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
