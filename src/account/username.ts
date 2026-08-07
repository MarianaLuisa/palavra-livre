/**
 * Regras de nome de usuario.
 *
 * Modulo puro, sem dependencia de rede: a mesma validacao serve ao
 * formulario, ao motor local dos testes e espelha a constraint
 * profiles_username_format no banco.
 *
 * A unicidade de verdade e o indice UNIQUE em profiles.username_normalized.
 * Validar aqui e ergonomia, nao garantia.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/** Letras, numeros, ponto, hifen e underscore. Nao comeca nem termina em simbolo. */
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]$/;

export function isValidUsernameFormat(username: string): boolean {
  const clean = username.trim();

  return (
    clean.length >= USERNAME_MIN_LENGTH &&
    clean.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(clean)
  );
}

/** Forma comparavel: e o que o banco guarda em username_normalized. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
