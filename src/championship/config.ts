import type { ChampionshipMode } from "./types";

/**
 * Ponto unico de configuracao da modalidade competitiva.
 *
 * O nome da modalidade aparece SOMENTE aqui. Para renomear para
 * "Palavra Livre Arena", "Liga Palavra Livre" ou "Torneio Palavra Livre",
 * basta trocar os valores deste arquivo.
 */
export const CHAMPIONSHIP_BRAND = {
  /** Nome completo, usado em titulos e no texto de compartilhamento. */
  name: "Campeonato Diario",
  /** Nome curto, usado em botoes e navegacao. */
  shortName: "Campeonato",
  /** Como o participante e chamado. */
  participantLabel: "participante",
  participantLabelPlural: "participantes",
  /** Nome do evento em textos corridos ("o campeonato comeca..."). */
  eventLabel: "campeonato",
  /** Slug base das rotas. Trocar aqui muda todas as URLs da modalidade. */
  routeBase: "/campeonato",
} as const;

export const FREE_PLAY_BRAND = {
  name: "Jogo Livre",
  shortName: "Jogo Livre",
  routeBase: "/jogo-livre",
} as const;

/** Fuso oficial do campeonato. O backend continua sendo a fonte do horario. */
export const CHAMPIONSHIP_TIMEZONE = "America/Sao_Paulo";

/**
 * Regras de pontuacao. Espelham championship_config no banco.
 * O servidor continua sendo a autoridade: estes valores servem
 * para exibicao, simulacao e testes.
 */
export const CHAMPIONSHIP_SCORING = {
  pointsPerWord: 100,
  bonusPerRemainingAttempt: 10,
} as const;

/** Ordem obrigatoria das modalidades. */
export const CHAMPIONSHIP_MODE_ORDER: ChampionshipMode[] = [
  "SIMPLE",
  "DUET",
  "QUARTET",
  "SEXTET",
];

export const CHAMPIONSHIP_MODE_LABEL: Record<ChampionshipMode, string> = {
  SIMPLE: "Simples",
  DUET: "Dueto",
  QUARTET: "Quarteto",
  SEXTET: "Sexteto",
};

/** Total de palavras de um campeonato: 1 + 2 + 4 + 6. */
export const CHAMPIONSHIP_TOTAL_WORDS = 13;

/** Pontuacao maxima base, sem bonus: 13 x 100. */
export const CHAMPIONSHIP_MAX_BASE_SCORE =
  CHAMPIONSHIP_TOTAL_WORDS * CHAMPIONSHIP_SCORING.pointsPerWord;

export const CHAMPIONSHIP_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendado",
  REGISTRATION_OPEN: "Inscricoes abertas",
  WAITING: "Sala de espera",
  IN_PROGRESS: "Em andamento",
  CALCULATING_RESULTS: "Apurando resultados",
  FINISHED: "Encerrado",
  CANCELLED: "Cancelado",
};

export const PARTICIPATION_STATUS_LABEL: Record<string, string> = {
  REGISTERED: "Inscrito",
  IN_PROGRESS: "Jogando",
  FINISHED: "Concluiu",
  ABANDONED: "Abandonou",
  CANCELLED: "Cancelado",
};

export const PARTICIPANT_ROUND_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Nao iniciada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluida",
  FAILED: "Sem sucesso",
  EXPIRED: "Encerrada",
};

/** Rotas da modalidade, derivadas do slug configuravel. */
export const CHAMPIONSHIP_ROUTES = {
  home: "/",
  freePlay: FREE_PLAY_BRAND.routeBase,
  championship: CHAMPIONSHIP_BRAND.routeBase,
  leaderboard: `${CHAMPIONSHIP_BRAND.routeBase}/classificacao`,
  results: `${CHAMPIONSHIP_BRAND.routeBase}/resultado`,
  history: `${CHAMPIONSHIP_BRAND.routeBase}/historico`,
  admin: `${CHAMPIONSHIP_BRAND.routeBase}/admin`,
} as const;

/** Intervalo de sincronizacao com o servidor na sala de espera. */
export const LOBBY_POLL_INTERVAL_MS = 5000;
/** Intervalo de sincronizacao durante o campeonato. */
export const IN_PROGRESS_POLL_INTERVAL_MS = 15000;
