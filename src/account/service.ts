import { ChampionshipError } from "../championship/errors";
import { GAME_MODE_TO_CHAMPIONSHIP_MODE } from "../championship/types";
import { getSupabaseClient, isChampionshipConfigured } from "../championship/supabaseClient";
import { isValidUsernameFormat } from "./username";
import type { GameMode } from "../types/game";
import type {
  ChampionshipHistoryEntry,
  HomeSummary,
  MonthProgress,
  PeriodComparison,
  PlayerProfile,
  PlayerStats,
  RecordGameInput,
  RecordGameResult,
  SignUpInput,
  SignUpResult,
  UsernameAvailability,
} from "./types";

/**
 * Contrato de acesso a conta e ao progresso do jogador.
 *
 * Mesma estrategia do campeonato: a interface isola a UI do backend, e o
 * motor local implementa o mesmo contrato para os testes rodarem sem
 * Supabase.
 *
 * Nenhum metodo aqui aceita "de quem" e o progresso. O servidor sempre
 * resolve o dono por auth.uid().
 */
export { isValidUsernameFormat } from "./username";

export interface AccountService {
  isConfigured(): boolean;
  hasSession(): boolean;

  signUp(input: SignUpInput): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): void;
  requestPasswordReset(email: string, redirectTo?: string): Promise<void>;
  updatePassword(password: string): Promise<void>;

  /** Converte a sessao anonima atual em conta permanente, mesmo UUID. */
  convertAnonymousAccount(input: SignUpInput): Promise<SignUpResult>;
  isAnonymousSession(): boolean;

  getProfile(): Promise<PlayerProfile | null>;
  setUsername(username: string): Promise<PlayerProfile>;
  checkUsername(username: string): Promise<UsernameAvailability>;
  setDailyGoal(goal: number): Promise<void>;

  recordGame(input: RecordGameInput): Promise<RecordGameResult>;
  getMonthProgress(month?: string): Promise<MonthProgress>;
  getPlayerStats(from?: string | null, to?: string | null): Promise<PlayerStats>;
  comparePeriods(
    firstFrom: string,
    firstTo: string,
    secondFrom: string,
    secondTo: string,
  ): Promise<PeriodComparison>;
  getChampionshipHistory(limit?: number, offset?: number): Promise<ChampionshipHistoryEntry[]>;
  getHomeSummary(): Promise<HomeSummary>;
}

function requireClient() {
  const client = getSupabaseClient();

  if (client === null) {
    throw new ChampionshipError("NOT_CONFIGURED");
  }

  return client;
}

function validateSignUp(input: SignUpInput): void {
  if (input.password !== input.passwordConfirmation) {
    throw new ChampionshipError("PASSWORD_MISMATCH");
  }

  if (input.password.length < 6) {
    throw new ChampionshipError("WEAK_PASSWORD");
  }

  if (!isValidUsernameFormat(input.username)) {
    throw new ChampionshipError("INVALID_USERNAME");
  }
}

export class SupabaseAccountService implements AccountService {
  isConfigured(): boolean {
    return isChampionshipConfigured();
  }

  hasSession(): boolean {
    return getSupabaseClient()?.isAuthenticated() ?? false;
  }

  isAnonymousSession(): boolean {
    const session = getSupabaseClient()?.getSession() ?? null;
    return session !== null && session.isAnonymous === true;
  }

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    validateSignUp(input);
    const client = requireClient();

    // Checagem amistosa antes de criar o usuario. A garantia real e o
    // indice UNIQUE no banco, aplicado no pl_set_username abaixo.
    const availability = await this.checkUsername(input.username);

    if (!availability.available) {
      throw new ChampionshipError(availability.reason ?? "USERNAME_TAKEN");
    }

    const session = await client.signUp(input.email.trim(), input.password, {
      username: input.username.trim(),
      display_name: input.username.trim(),
    });

    if (session === null) {
      return { status: "CONFIRMATION_REQUIRED" };
    }

    // Confirma o username no perfil. Se outra pessoa levou o nome nesse
    // intervalo, o banco recusa e a interface pede outro.
    await this.setUsername(input.username.trim());
    return { status: "SIGNED_IN" };
  }

  /**
   * Converte a sessao anonima em conta permanente.
   *
   * O Supabase mantem o mesmo auth.users.id, entao tudo que aponta para
   * esse id continua valendo: perfil, inscricoes no campeonato,
   * tentativas e a linha em championship_admins.
   */
  async convertAnonymousAccount(input: SignUpInput): Promise<SignUpResult> {
    validateSignUp(input);
    const client = requireClient();

    if (!client.isAuthenticated()) {
      throw new ChampionshipError("NOT_AUTHENTICATED");
    }

    const availability = await this.checkUsername(input.username);

    if (!availability.available) {
      throw new ChampionshipError(availability.reason ?? "USERNAME_TAKEN");
    }

    await client.updateUser({
      email: input.email.trim(),
      password: input.password,
      data: { username: input.username.trim(), display_name: input.username.trim() },
    });

    await this.setUsername(input.username.trim());

    // Com confirmacao de e-mail ligada, o endereco so passa a valer depois
    // do clique no link, mas a senha ja funciona e o UUID nao mudou.
    return { status: "SIGNED_IN" };
  }

  async signIn(email: string, password: string): Promise<void> {
    await requireClient().signInWithPassword(email.trim(), password);
  }

  signOut(): void {
    getSupabaseClient()?.signOut();
  }

  async requestPasswordReset(email: string, redirectTo?: string): Promise<void> {
    await requireClient().requestPasswordReset(email.trim(), redirectTo);
  }

  async updatePassword(password: string): Promise<void> {
    if (password.length < 6) {
      throw new ChampionshipError("WEAK_PASSWORD");
    }

    await requireClient().updateUser({ password });
  }

  async getProfile(): Promise<PlayerProfile | null> {
    if (!this.hasSession()) {
      return null;
    }

    return requireClient().rpc<PlayerProfile | null>("pl_get_my_profile", {});
  }

  setUsername(username: string): Promise<PlayerProfile> {
    return requireClient().rpc<PlayerProfile>("pl_set_username", {
      p_username: username.trim(),
    });
  }

  checkUsername(username: string): Promise<UsernameAvailability> {
    return requireClient().rpc<UsernameAvailability>("pl_username_available", {
      p_username: username.trim(),
    });
  }

  async setDailyGoal(goal: number): Promise<void> {
    await requireClient().rpc("pl_set_daily_goal", { p_goal: goal });
  }

  recordGame(input: RecordGameInput): Promise<RecordGameResult> {
    return requireClient().rpc<RecordGameResult>("pl_record_game", {
      p_client_game_id: input.clientGameId,
      p_mode: input.mode,
      p_attempts_used: input.attemptsUsed,
      p_words_solved: input.wordsSolved,
      p_duration_ms: input.durationMs,
      p_started_at: input.startedAt,
    });
  }

  getMonthProgress(month?: string): Promise<MonthProgress> {
    return requireClient().rpc<MonthProgress>("pl_get_month_progress", {
      p_month: month ?? null,
    });
  }

  getPlayerStats(from?: string | null, to?: string | null): Promise<PlayerStats> {
    return requireClient().rpc<PlayerStats>("pl_get_player_stats", {
      p_from: from ?? null,
      p_to: to ?? null,
    });
  }

  comparePeriods(
    firstFrom: string,
    firstTo: string,
    secondFrom: string,
    secondTo: string,
  ): Promise<PeriodComparison> {
    return requireClient().rpc<PeriodComparison>("pl_compare_periods", {
      p_first_from: firstFrom,
      p_first_to: firstTo,
      p_second_from: secondFrom,
      p_second_to: secondTo,
    });
  }

  getChampionshipHistory(limit = 30, offset = 0): Promise<ChampionshipHistoryEntry[]> {
    return requireClient().rpc<ChampionshipHistoryEntry[]>(
      "pl_get_my_championship_history",
      { p_limit: limit, p_offset: offset },
    );
  }

  getHomeSummary(): Promise<HomeSummary> {
    return requireClient().rpc<HomeSummary>("pl_get_home_summary", {});
  }
}

/** Converte o modo do Jogo Livre para o enum usado no banco. */
export function toChampionshipMode(mode: GameMode) {
  return GAME_MODE_TO_CHAMPIONSHIP_MODE[mode];
}

let defaultService: AccountService | null = null;

export function getAccountService(): AccountService {
  if (defaultService === null) {
    defaultService = new SupabaseAccountService();
  }

  return defaultService;
}

/** Permite injetar outra implementacao (testes, modo demonstracao). */
export function setAccountService(service: AccountService | null): void {
  defaultService = service;
}
