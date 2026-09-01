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
  name: "Campeonato Norte",
  /** Nome curto, usado em botoes e navegacao. */
  shortName: "Campeonatos",
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
  REGISTRATION_OPEN: "Disponível hoje",
  WAITING: "Disponível em breve",
  IN_PROGRESS: "Em andamento",
  CALCULATING_RESULTS: "Apurando resultados",
  FINISHED: "Finalizado",
  CANCELLED: "Cancelado",
};

/** O que acontece depois do status atual. Usado no painel administrativo. */
export const CHAMPIONSHIP_NEXT_STEP_LABEL: Record<string, string> = {
  SCHEDULED: "Aguardar o dia do campeonato",
  REGISTRATION_OPEN: "Campeonato disponível",
  WAITING: "Aguardar liberação",
  IN_PROGRESS: "Disponível até o fim do dia",
  CALCULATING_RESULTS: "Publicar a classificação",
  FINISHED: "Criar o campeonato do próximo dia",
  CANCELLED: "Criar um novo campeonato",
};

export const PARTICIPATION_STATUS_LABEL: Record<string, string> = {
  REGISTERED: "Participando",
  IN_PROGRESS: "Jogando",
  FINISHED: "Concluiu",
  ABANDONED: "Abandonou",
  CANCELLED: "Cancelado",
};

export const PARTICIPANT_ROUND_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Não iniciada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
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
