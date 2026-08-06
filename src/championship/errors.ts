/** Codigos de erro devolvidos pelas funcoes do banco. */
export type ChampionshipErrorCode =
  | "NOT_AUTHENTICATED"
  | "NOT_CONFIGURED"
  | "NETWORK_ERROR"
  | "CHAMPIONSHIP_NOT_FOUND"
  | "CHAMPIONSHIP_NOT_IN_PROGRESS"
  | "CHAMPIONSHIP_NOT_FINISHED"
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
  | "FORBIDDEN"
  | "UNKNOWN";

const ERROR_MESSAGES: Record<ChampionshipErrorCode, string> = {
  NOT_AUTHENTICATED: "Voce precisa entrar para participar do campeonato.",
  NOT_CONFIGURED:
    "O campeonato ainda nao esta configurado neste ambiente. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
  NETWORK_ERROR: "Nao foi possivel falar com o servidor. Verifique sua conexao.",
  CHAMPIONSHIP_NOT_FOUND: "Nenhum campeonato disponivel no momento.",
  CHAMPIONSHIP_NOT_IN_PROGRESS: "O campeonato nao esta em andamento.",
  CHAMPIONSHIP_NOT_FINISHED: "O campeonato ainda nao foi encerrado.",
  REGISTRATION_CLOSED: "As inscricoes deste campeonato estao encerradas.",
  CANCELLATION_NOT_ALLOWED: "Nao e mais possivel cancelar a inscricao.",
  DISPLAY_NAME_TAKEN: "Ja existe alguem com esse nome neste campeonato.",
  INVALID_DISPLAY_NAME: "Escolha um nome entre 2 e 24 caracteres.",
  NOT_REGISTERED: "Voce nao esta inscrito neste campeonato.",
  ROUND_NOT_FOUND: "Rodada nao encontrada.",
  ROUND_NOT_STARTED: "Inicie a rodada antes de enviar tentativas.",
  ROUND_ALREADY_FINISHED: "Esta rodada ja foi encerrada.",
  PREVIOUS_ROUND_PENDING: "Conclua a modalidade anterior antes de avancar.",
  NO_ATTEMPTS_LEFT: "Suas tentativas nesta modalidade acabaram.",
  DUPLICATE_ATTEMPT: "Voce ja tentou essa palavra nesta modalidade.",
  INVALID_WORD_LENGTH: "A palavra precisa ter cinco letras.",
  WORD_NOT_ACCEPTED: "Essa palavra nao e aceita.",
  WORD_POOL_TOO_SMALL: "A base de respostas do servidor e menor que o necessario.",
  WORD_POOL_EXHAUSTED: "Nao ha respostas suficientes para sortear o campeonato.",
  REDRAW_NOT_ALLOWED: "Nao e possivel sortear novas palavras depois do inicio.",
  SCHEDULE_UPDATE_NOT_ALLOWED: "Nao e possivel alterar horarios depois do inicio.",
  CHAMPIONSHIP_WITHOUT_ROUNDS: "O campeonato nao possui modalidades configuradas.",
  FORBIDDEN: "Voce nao tem permissao para esta acao.",
  UNKNOWN: "Algo deu errado. Tente novamente.",
};

export class ChampionshipError extends Error {
  readonly code: ChampionshipErrorCode;
  readonly details?: unknown;

  constructor(code: ChampionshipErrorCode, details?: unknown) {
    super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN);
    this.name = "ChampionshipError";
    this.code = code;
    this.details = details;
  }
}

function isErrorCode(value: string): value is ChampionshipErrorCode {
  return value in ERROR_MESSAGES;
}

/** Converte a mensagem crua do Postgres em um erro tipado. */
export function toChampionshipError(error: unknown): ChampionshipError {
  if (error instanceof ChampionshipError) {
    return error;
  }

  const rawMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "";

  const match = rawMessage.match(/[A-Z][A-Z0-9_]{3,}/);

  if (match !== null && isErrorCode(match[0])) {
    return new ChampionshipError(match[0], error);
  }

  return new ChampionshipError("UNKNOWN", error);
}

export function getErrorMessage(error: unknown): string {
  return toChampionshipError(error).message;
}
