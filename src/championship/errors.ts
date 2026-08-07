/** Codigos de erro devolvidos pelas funcoes do banco. */
export type ChampionshipErrorCode =
  | "NOT_AUTHENTICATED"
  | "NOT_CONFIGURED"
  | "NETWORK_ERROR"
  | "CHAMPIONSHIP_NOT_FOUND"
  | "CHAMPIONSHIP_NOT_IN_PROGRESS"
  | "CHAMPIONSHIP_NOT_FINISHED"
  | "CHAMPIONSHIP_CANCELLED"
  | "CHAMPIONSHIP_ALREADY_FINISHED"
  | "CHAMPIONSHIP_WITHOUT_ANSWERS"
  | "INVALID_SCHEDULE_ORDER"
  | "ANSWERS_NOT_AVAILABLE"
  | "REGISTRATION_CLOSED"
  | "CANCELLATION_NOT_ALLOWED"
  | "DISPLAY_NAME_TAKEN"
  | "INVALID_DISPLAY_NAME"
  | "NOT_REGISTERED"
  | "ROUND_NOT_FOUND"
  | "ROUND_NOT_STARTED"
  | "ROUND_ALREADY_FINISHED"
  | "PREVIOUS_ROUND_PENDING"
  | "NO_ATTEMPTS_LEFT"
  | "DUPLICATE_ATTEMPT"
  | "INVALID_WORD_LENGTH"
  | "WORD_NOT_ACCEPTED"
  | "WORD_POOL_TOO_SMALL"
  | "WORD_POOL_EXHAUSTED"
  | "REDRAW_NOT_ALLOWED"
  | "SCHEDULE_UPDATE_NOT_ALLOWED"
  | "CHAMPIONSHIP_WITHOUT_ROUNDS"
  | "CHAMPIONSHIP_DATE_TAKEN"
  | "NO_FREE_CHAMPIONSHIP_DATE"
  | "FUNCTION_NOT_DEPLOYED"
  | "FORBIDDEN"
  // ---- Contas de jogador ------------------------------------------------
  | "EMAIL_ALREADY_REGISTERED"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_CONFIRMED"
  | "INVALID_EMAIL"
  | "WEAK_PASSWORD"
  | "PASSWORD_MISMATCH"
  | "RATE_LIMITED"
  | "USERNAME_TAKEN"
  | "INVALID_USERNAME"
  | "SIGNUP_DISABLED"
  | "ANONYMOUS_DISABLED"
  | "INVALID_GAME_ID"
  | "INVALID_GAME_MODE"
  | "INVALID_ATTEMPTS"
  | "INVALID_WORDS_SOLVED"
  | "GAME_NOT_FINISHED"
  | "INVALID_DAILY_GOAL"
  // ---- Diagnostico -------------------------------------------------------
  | "GUESS_LENGTH_MISMATCH"
  | "INVALID_SCORE_INPUT"
  | "ATTEMPT_FAILED"
  | "UNKNOWN";

const ERROR_MESSAGES: Record<ChampionshipErrorCode, string> = {
  NOT_AUTHENTICATED: "Você precisa entrar para participar do campeonato.",
  NOT_CONFIGURED:
    "O campeonato ainda não está configurado neste ambiente. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
  NETWORK_ERROR: "Não foi possível falar com o servidor. Verifique sua conexão.",
  CHAMPIONSHIP_NOT_FOUND: "Nenhum campeonato disponível no momento.",
  CHAMPIONSHIP_NOT_IN_PROGRESS: "O campeonato não está em andamento.",
  CHAMPIONSHIP_NOT_FINISHED: "O campeonato ainda não foi encerrado.",
  CHAMPIONSHIP_CANCELLED: "Este campeonato foi cancelado e não pode ser iniciado.",
  CHAMPIONSHIP_ALREADY_FINISHED: "Este campeonato já foi encerrado.",
  CHAMPIONSHIP_WITHOUT_ANSWERS:
    "O campeonato ainda não tem palavras sorteadas. Sorteie as palavras antes de iniciar.",
  INVALID_SCHEDULE_ORDER:
    "Os horários precisam seguir a ordem: abertura, fechamento e início.",
  ANSWERS_NOT_AVAILABLE:
    "As respostas só ficam disponíveis depois que o campeonato é encerrado.",
  REGISTRATION_CLOSED: "As inscrições deste campeonato estão encerradas.",
  CANCELLATION_NOT_ALLOWED: "Não é mais possível cancelar a inscrição.",
  DISPLAY_NAME_TAKEN: "Já existe alguém com esse nome neste campeonato.",
  INVALID_DISPLAY_NAME: "Escolha um nome entre 2 e 24 caracteres.",
  NOT_REGISTERED: "Você não está inscrito neste campeonato.",
  ROUND_NOT_FOUND: "Rodada não encontrada.",
  ROUND_NOT_STARTED: "Inicie a rodada antes de enviar tentativas.",
  ROUND_ALREADY_FINISHED: "Esta rodada já foi encerrada.",
  PREVIOUS_ROUND_PENDING: "Conclua a modalidade anterior antes de avançar.",
  NO_ATTEMPTS_LEFT: "Suas tentativas nesta modalidade acabaram.",
  DUPLICATE_ATTEMPT: "Você já tentou essa palavra nesta modalidade.",
  INVALID_WORD_LENGTH: "A palavra precisa ter cinco letras.",
  WORD_NOT_ACCEPTED: "Essa palavra não é aceita.",
  WORD_POOL_TOO_SMALL: "A base de respostas do servidor é menor que o necessário.",
  WORD_POOL_EXHAUSTED: "Não há respostas suficientes para sortear o campeonato.",
  REDRAW_NOT_ALLOWED: "Não é possível sortear novas palavras depois do início.",
  SCHEDULE_UPDATE_NOT_ALLOWED: "Não é possível alterar horários depois do início.",
  CHAMPIONSHIP_WITHOUT_ROUNDS: "O campeonato não possui modalidades configuradas.",
  CHAMPIONSHIP_DATE_TAKEN:
    "Já existe um campeonato nessa data. Campeonatos encerrados continuam ocupando o dia, para não sobrescrever o histórico.",
  NO_FREE_CHAMPIONSHIP_DATE:
    "Não há data livre nos próximos 60 dias. Cancele algum campeonato agendado antes de criar outro.",
  FUNCTION_NOT_DEPLOYED:
    "Esta função ainda não existe no banco. Aplique as migrations pendentes com supabase db push.",
  FORBIDDEN: "Você não tem permissão para esta ação.",

  EMAIL_ALREADY_REGISTERED:
    "Já existe uma conta com esse e-mail. Tente entrar ou recuperar a senha.",
  INVALID_CREDENTIALS: "E-mail ou senha incorretos.",
  EMAIL_NOT_CONFIRMED:
    "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada e o spam.",
  INVALID_EMAIL: "Informe um e-mail válido.",
  WEAK_PASSWORD: "A senha precisa ter pelo menos 6 caracteres.",
  PASSWORD_MISMATCH: "As senhas não conferem.",
  RATE_LIMITED: "Muitas tentativas seguidas. Aguarde um instante e tente de novo.",
  USERNAME_TAKEN: "Esse nome de usuário já está em uso.",
  INVALID_USERNAME:
    "Use de 3 a 20 caracteres: letras, números, ponto, hífen ou underscore.",
  SIGNUP_DISABLED: "O cadastro está desabilitado neste projeto.",
  ANONYMOUS_DISABLED:
    "O acesso sem conta está desabilitado. Crie uma conta para participar.",
  INVALID_GAME_ID: "Identificador de partida inválido.",
  INVALID_GAME_MODE: "Modo de jogo inválido.",
  INVALID_ATTEMPTS: "Quantidade de tentativas inválida para este modo.",
  INVALID_WORDS_SOLVED: "Quantidade de palavras resolvidas inválida para este modo.",
  GAME_NOT_FINISHED: "A partida ainda não terminou.",
  INVALID_DAILY_GOAL: "A meta diária precisa ficar entre 1 e 20 partidas.",

  GUESS_LENGTH_MISMATCH:
    "A palavra do dia está com formato inesperado no servidor. Avise a administração.",
  INVALID_SCORE_INPUT: "O servidor recusou o cálculo de pontuação desta rodada.",
  ATTEMPT_FAILED: "A tentativa não pôde ser registrada.",

  UNKNOWN: "Algo deu errado. Tente novamente.",
};

/**
 * Erro cru devolvido pelo servidor.
 *
 * O PostgREST responde com { code, message, details, hint }, onde `code` e o
 * SQLSTATE do Postgres. Guardar isso e o que permite descobrir a causa real
 * de um 400 em vez de exibir "algo deu errado" e perder a evidencia.
 */
export type ServerErrorInfo = {
  message?: string;
  /** SQLSTATE (ex.: 42702) ou codigo do PostgREST (ex.: PGRST202). */
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
};

/**
 * O GoTrue responde em ingles e em prosa, entao o extrator de codigo
 * em maiusculas nao serve. Este mapeamento traduz as mensagens conhecidas.
 */
const AUTH_MESSAGE_PATTERNS: Array<[RegExp, ChampionshipErrorCode]> = [
  [/already registered|already been registered|user already exists/i, "EMAIL_ALREADY_REGISTERED"],
  [/invalid login credentials|invalid credentials/i, "INVALID_CREDENTIALS"],
  [/email not confirmed|confirm your email/i, "EMAIL_NOT_CONFIRMED"],
  [/unable to validate email|invalid email|email address.*invalid/i, "INVALID_EMAIL"],
  [/password should be|password is too short|weak password/i, "WEAK_PASSWORD"],
  [/rate limit|too many requests|over_email_send_rate/i, "RATE_LIMITED"],
  [/signups? (not allowed|disabled)/i, "SIGNUP_DISABLED"],
  [/anonymous sign-?ins? are disabled/i, "ANONYMOUS_DISABLED"],
];

export function toAuthError(message: string, status?: number): ChampionshipError {
  for (const [pattern, code] of AUTH_MESSAGE_PATTERNS) {
    if (pattern.test(message)) {
      return new ChampionshipError(code, message);
    }
  }

  if (status === 429) {
    return new ChampionshipError("RATE_LIMITED", message);
  }

  if (status === 401 || status === 400) {
    return new ChampionshipError("INVALID_CREDENTIALS", message);
  }

  return toChampionshipError(message);
}

export class ChampionshipError extends Error {
  readonly code: ChampionshipErrorCode;
  readonly details?: unknown;
  /** Resposta crua do servidor, preservada para diagnostico. */
  readonly server?: ServerErrorInfo;

  constructor(
    code: ChampionshipErrorCode,
    details?: unknown,
    server?: ServerErrorInfo,
  ) {
    super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN);
    this.name = "ChampionshipError";
    this.code = code;
    this.details = details;
    this.server = server;
  }
}

function isErrorCode(value: string): value is ChampionshipErrorCode {
  return value in ERROR_MESSAGES;
}

/** Converte a mensagem crua do Postgres em um erro tipado. */
/**
 * Interpreta a resposta de erro do servidor.
 *
 * Aceita tanto uma string quanto o corpo completo do PostgREST
 * ({ code, message, details, hint }). O texto e o SQLSTATE originais sao
 * SEMPRE preservados em `server`, mesmo quando reconhecemos o codigo:
 * sem isso, um 400 inesperado vira "algo deu errado" e a evidencia some.
 */
export function toChampionshipError(
  error: unknown,
  status?: number,
): ChampionshipError {
  if (error instanceof ChampionshipError) {
    return error;
  }

  const server = readServerError(error, status);

  // Migration pendente: o PostgREST nao acha a funcao no schema cache.
  if (isMissingFunctionError(server)) {
    return new ChampionshipError("FUNCTION_NOT_DEPLOYED", error, server);
  }

  const rawMessage = server.message ?? "";
  const match = rawMessage.match(/[A-Z][A-Z0-9_]{3,}/);

  if (match !== null && isErrorCode(match[0])) {
    return new ChampionshipError(match[0], error, server);
  }

  return new ChampionshipError("UNKNOWN", error, server);
}

/**
 * A RPC nao existe no banco.
 *
 * Acontece quando o frontend ja usa uma funcao cuja migration ainda nao
 * foi aplicada. Vale a pena distinguir: nao e um bug do codigo, e um
 * passo de deploy faltando.
 */
export function isMissingFunctionError(server: ServerErrorInfo | undefined): boolean {
  if (server === undefined) {
    return false;
  }

  return (
    server.code === "PGRST202" ||
    /could not find the function/i.test(server.message ?? "")
  );
}

/** A data ja tem campeonato oficial ativo, nas duas versoes da funcao. */
export function isDateTakenError(error: unknown): boolean {
  const championshipError = toChampionshipError(error);

  return (
    championshipError.code === "CHAMPIONSHIP_DATE_TAKEN" ||
    championshipError.server?.code === "23505" ||
    /championships_one_official_per_date/.test(
      championshipError.server?.message ?? "",
    )
  );
}

function readServerError(error: unknown, status?: number): ServerErrorInfo {
  if (typeof error === "string") {
    return { message: error, status };
  }

  if (error instanceof Error) {
    return { message: error.message, status };
  }

  if (typeof error === "object" && error !== null) {
    const payload = error as Record<string, unknown>;
    const asText = (value: unknown): string | undefined =>
      typeof value === "string" && value.length > 0 ? value : undefined;

    return {
      message: asText(payload.message),
      code: asText(payload.code),
      details: asText(payload.details),
      hint: asText(payload.hint),
      status,
    };
  }

  return { status };
}

/** Codigos cuja mensagem amigavel nao explica nada sozinha. */
const OPAQUE_CODES = new Set<ChampionshipErrorCode>(["UNKNOWN", "ATTEMPT_FAILED"]);

/** Resumo tecnico legivel do erro do servidor, para nao esconder a causa. */
export function describeServerError(server?: ServerErrorInfo): string | null {
  if (server === undefined) {
    return null;
  }

  const parts = [server.code, server.message, server.hint]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .map((part) => part.trim());

  if (parts.length === 0) {
    return null;
  }

  const text = parts.join(" · ");
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

/**
 * Mensagem para a pessoa.
 *
 * Para erros de regra conhecidos, devolve o texto amigavel.
 * Para erros que nao sabemos traduzir, ANEXA a causa real em vez de
 * engolir: e melhor mostrar "42702 column reference is ambiguous" do que
 * deixar a pessoa e quem for depurar sem nenhuma pista.
 */
export function getErrorMessage(error: unknown): string {
  const championshipError = toChampionshipError(error);

  if (!OPAQUE_CODES.has(championshipError.code)) {
    return championshipError.message;
  }

  const serverText = describeServerError(championshipError.server);

  return serverText === null
    ? championshipError.message
    : `${championshipError.message} (${serverText})`;
}
