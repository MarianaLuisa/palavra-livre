import { ChampionshipError } from "./errors";
import { getSupabaseClient, isChampionshipConfigured } from "./supabaseClient";
import type {
  AdminOverview,
  ChampionshipHistoryItem,
  ChampionshipPlayerStats,
  ChampionshipResults,
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
  getResults(championshipId?: string): Promise<ChampionshipResults>;
  getHistory(limit?: number, offset?: number): Promise<ChampionshipHistoryItem[]>;
  getPlayerStats(): Promise<ChampionshipPlayerStats>;

  getAdminOverview(championshipId?: string): Promise<AdminOverview>;
  createChampionship(input?: CreateChampionshipInput): Promise<{ championshipId: string }>;
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
