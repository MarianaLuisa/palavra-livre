/** Rotas da area de conta e progresso. */
export const ACCOUNT_ROUTES = {
  login: "/login",
  signUp: "/cadastro",
  recoverPassword: "/recuperar-senha",
  profile: "/perfil",
  progress: "/progresso",
  stats: "/estatisticas",
  championshipHistory: "/campeonatos/historico",
} as const;

/** Rotas que exigem conta permanente. */
export const PROTECTED_ROUTES: string[] = [
  ACCOUNT_ROUTES.profile,
  ACCOUNT_ROUTES.progress,
  ACCOUNT_ROUTES.stats,
  ACCOUNT_ROUTES.championshipHistory,
];

/** Parametro usado para voltar a pagina desejada depois do login. */
export const REDIRECT_PARAM = "proximo";

export const MODE_LABEL_PT: Record<string, string> = {
  SIMPLE: "Simples",
  DUET: "Dueto",
  QUARTET: "Quarteto",
  SEXTET: "Sexteto",
};

export const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Segunda a domingo, como o calendário é montado. */
export const WEEKDAY_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export const USERNAME_RULES = {
  minLength: 3,
  maxLength: 20,
  hint: "De 3 a 20 caracteres: letras, números, ponto, hífen ou underscore.",
} as const;

export const PASSWORD_RULES = {
  minLength: 6,
  hint: "Pelo menos 6 caracteres.",
} as const;
