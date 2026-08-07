import { ChampionshipError, toAuthError, toChampionshipError } from "./errors";

/**
 * Cliente minimo do Supabase construido sobre fetch.
 *
 * Decisao tecnica: o projeto usa apenas RPCs SECURITY DEFINER, entao o unico
 * contato com o Supabase e /auth/v1 (sessao anonima) e /rest/v1/rpc.
 * Escrever esses dois caminhos a mao mantem o requisito de nao adicionar
 * bibliotecas desnecessarias e deixa o bundle sem dependencias extras.
 */

const SESSION_STORAGE_KEY = "palavra-livre:championship-session";
const TOKEN_EXPIRATION_MARGIN_MS = 60_000;

export type SupabaseSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  /** Sessao anonima do Supabase (sem e-mail e sem senha). */
  isAnonymous?: boolean;
  /** E-mail da conta permanente. Nunca sai desta camada para telas publicas. */
  email?: string | null;
};

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

type RawSession = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: {
    id?: string;
    email?: string | null;
    is_anonymous?: boolean;
  };
  // Resposta de cadastro com confirmacao por e-mail: vem so o usuario.
  id?: string;
  email?: string | null;
};

function readEnv(name: string): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return (env[name] ?? "").trim();
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = readEnv("VITE_SUPABASE_URL");
  const anonKey = readEnv("VITE_SUPABASE_ANON_KEY");

  if (url.length === 0 || anonKey.length === 0) {
    return null;
  }

  return { url: url.replace(/\/+$/, ""), anonKey };
}

export function isChampionshipConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function loadSession(): SupabaseSession | null {
  const storage = getStorage();

  if (storage === null) {
    return null;
  }

  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);

    if (raw === null) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SupabaseSession>;

    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.userId !== "string"
    ) {
      return null;
    }

    return parsed as SupabaseSession;
  } catch {
    return null;
  }
}

function saveSession(session: SupabaseSession | null): void {
  const storage = getStorage();

  if (storage === null) {
    return;
  }

  if (session === null) {
    storage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function normalizeSession(raw: RawSession): SupabaseSession {
  if (
    typeof raw.access_token !== "string" ||
    typeof raw.refresh_token !== "string" ||
    typeof raw.user?.id !== "string"
  ) {
    throw new ChampionshipError("NOT_AUTHENTICATED", raw);
  }

  const expiresAt =
    typeof raw.expires_at === "number"
      ? raw.expires_at * 1000
      : Date.now() + (raw.expires_in ?? 3600) * 1000;

  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt,
    userId: raw.user.id,
    isAnonymous: raw.user.is_anonymous ?? false,
    email: raw.user.email ?? null,
  };
}

export class SupabaseClient {
  private session: SupabaseSession | null;
  private refreshPromise: Promise<SupabaseSession> | null = null;

  constructor(private readonly config: SupabaseConfig) {
    this.session = loadSession();
  }

  getSession(): SupabaseSession | null {
    return this.session;
  }

  isAuthenticated(): boolean {
    return this.session !== null;
  }

  signOut(): void {
    this.session = null;
    saveSession(null);
  }

  /**
   * Sessao anonima: o jogador informa apenas o nome de exibicao e ganha
   * um user_id real e persistente. Exige "Anonymous sign-ins" habilitado
   * no painel do Supabase (Authentication > Providers).
   */
  async signInAnonymously(displayName: string): Promise<SupabaseSession> {
    const response = await fetch(`${this.config.url}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: { display_name: displayName } }),
    });

    const payload = (await response.json()) as RawSession & { msg?: string; error?: string };

    if (!response.ok) {
      throw toChampionshipError(payload.msg ?? payload.error ?? "NOT_AUTHENTICATED");
    }

    const session = normalizeSession(payload);
    this.session = session;
    saveSession(session);
    return session;
  }

  /** Chamada crua ao GoTrue, com tratamento uniforme de erro. */
  private async authRequest(
    path: string,
    init: { method: string; body?: unknown; useAccessToken?: boolean },
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      apikey: this.config.anonKey,
      "Content-Type": "application/json",
    };

    if (init.useAccessToken === true) {
      const token = await this.getAccessToken();

      if (token === null) {
        throw new ChampionshipError("NOT_AUTHENTICATED");
      }

      headers.Authorization = `Bearer ${token}`;
    } else {
      headers.Authorization = `Bearer ${this.config.anonKey}`;
    }

    let response: Response;

    try {
      response = await fetch(`${this.config.url}/auth/v1${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch (error) {
      throw new ChampionshipError("NETWORK_ERROR", error);
    }

    const text = await response.text();
    let payload: Record<string, unknown> = {};

    if (text.length > 0) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      const message =
        (payload.error_description as string | undefined) ??
        (payload.msg as string | undefined) ??
        (payload.message as string | undefined) ??
        (payload.error as string | undefined) ??
        text;

      throw toAuthError(message, response.status);
    }

    return payload;
  }

  private adoptSession(raw: RawSession): SupabaseSession {
    const session = normalizeSession(raw);
    this.session = session;
    saveSession(session);
    return session;
  }

  /**
   * Cadastro com e-mail e senha.
   *
   * Devolve null quando o projeto exige confirmacao por e-mail: nesse caso
   * o Supabase cria o usuario mas nao devolve sessao, e a pessoa precisa
   * clicar no link antes de entrar.
   */
  async signUp(
    email: string,
    password: string,
    metadata: Record<string, unknown> = {},
  ): Promise<SupabaseSession | null> {
    const payload = (await this.authRequest("/signup", {
      method: "POST",
      body: { email, password, data: metadata },
    })) as RawSession;

    if (typeof payload.access_token !== "string") {
      // Confirmacao por e-mail habilitada.
      return null;
    }

    return this.adoptSession(payload);
  }

  /** Login com e-mail e senha. */
  async signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
    const payload = (await this.authRequest("/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    })) as RawSession;

    return this.adoptSession(payload);
  }

  /** Envia o e-mail de recuperacao de senha. */
  async requestPasswordReset(email: string, redirectTo?: string): Promise<void> {
    const query =
      redirectTo === undefined ? "" : `?redirect_to=${encodeURIComponent(redirectTo)}`;

    await this.authRequest(`/recover${query}`, {
      method: "POST",
      body: { email },
    });
  }

  /**
   * Atualiza a propria conta.
   *
   * Este e o mecanismo oficial que converte uma sessao ANONIMA em conta
   * permanente: ao definir e-mail e senha, o Supabase mantem o MESMO
   * auth.users.id. Como profiles, championship_admins e
   * championship_participants apontam para esse id, o historico, a
   * inscricao e o acesso administrativo continuam intactos.
   */
  async updateUser(payload: {
    email?: string;
    password?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const result = (await this.authRequest("/user", {
      method: "PUT",
      body: payload,
      useAccessToken: true,
    })) as RawSession;

    // A resposta traz o usuario atualizado, sem tokens novos.
    if (this.session !== null && typeof result.id === "string") {
      this.session = {
        ...this.session,
        email: result.email ?? this.session.email ?? null,
        isAnonymous: false,
      };
      saveSession(this.session);
    }
  }

  /**
   * Adota tokens vindos do link de recuperacao de senha.
   * O Supabase devolve access_token e refresh_token no fragmento da URL.
   */
  async adoptTokens(accessToken: string, refreshToken: string): Promise<SupabaseSession> {
    // Confirma quem e o dono do token antes de guardar qualquer coisa.
    let response: Response;

    try {
      response = await fetch(`${this.config.url}/auth/v1/user`, {
        headers: {
          apikey: this.config.anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (error) {
      throw new ChampionshipError("NETWORK_ERROR", error);
    }

    if (!response.ok) {
      throw new ChampionshipError("NOT_AUTHENTICATED");
    }

    const user = (await response.json()) as {
      id?: string;
      email?: string | null;
      is_anonymous?: boolean;
    };

    return this.adoptSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      user,
    });
  }

  private async refreshSession(): Promise<SupabaseSession> {
    const current = this.session;

    if (current === null) {
      throw new ChampionshipError("NOT_AUTHENTICATED");
    }

    if (this.refreshPromise !== null) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      const response = await fetch(
        `${this.config.url}/auth/v1/token?grant_type=refresh_token`,
        {
          method: "POST",
          headers: {
            apikey: this.config.anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: current.refreshToken }),
        },
      );

      if (!response.ok) {
        this.signOut();
        throw new ChampionshipError("NOT_AUTHENTICATED");
      }

      const session = normalizeSession((await response.json()) as RawSession);
      this.session = session;
      saveSession(session);
      return session;
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.session === null) {
      return null;
    }

    if (this.session.expiresAt - TOKEN_EXPIRATION_MARGIN_MS <= Date.now()) {
      const refreshed = await this.refreshSession();
      return refreshed.accessToken;
    }

    return this.session.accessToken;
  }

  /** Chamada de RPC. Toda a logica sensivel vive do outro lado. */
  /** Chamada de RPC. Toda a lógica sensível vive do outro lado. */
  async rpc<T>(
    functionName: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const accessToken = await this.getAccessToken();

    const headers: Record<string, string> = {
      apikey: this.config.anonKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Authorization deve conter somente um JWT real de usuário.
    if (accessToken !== null) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    let response: Response;

    try {
      response = await fetch(
        `${this.config.url}/rest/v1/rpc/${functionName}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(args),
        },
      );
    } catch (error) {
      throw new ChampionshipError("NETWORK_ERROR", error);
    }

    if (response.status === 401 && this.session !== null) {
      await this.refreshSession();
      return this.rpc<T>(functionName, args);
    }

    const text = await response.text();

    let payload: unknown = null;

    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      // Repassa o corpo INTEIRO do PostgREST ({ code, message, details, hint }).
      // O `code` e o SQLSTATE do Postgres: sem ele, um 400 inesperado vira
      // "algo deu errado" e a causa real se perde.
      const errorPayload =
        typeof payload === "object" && payload !== null ? payload : { message: text };

      // Detalhe tecnico completo no console, sempre.
      console.error(
        `[supabase] rpc ${functionName} falhou (HTTP ${response.status})`,
        errorPayload,
        { args },
      );

      throw toChampionshipError(errorPayload, response.status);
    }

    return payload as T;
  }
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== null) {
    return cachedClient;
  }

  const config = getSupabaseConfig();

  if (config === null) {
    return null;
  }

  cachedClient = new SupabaseClient(config);
  return cachedClient;
}

/** Usado nos testes para isolar instancias. */
export function resetSupabaseClientCache(): void {
  cachedClient = null;
}
