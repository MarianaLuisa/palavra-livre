import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getErrorMessage } from "../../championship/errors";
import { formatDate, formatScore } from "../../championship/format";
import { Link } from "../../router/router";
import { useAuth } from "../AuthProvider";
import { StreakBadge } from "../components/StreakBadge";
import { ACCOUNT_ROUTES, USERNAME_RULES } from "../config";
import { getAccountService } from "../service";
import { isValidUsernameFormat } from "../username";
import type { PlayerStats } from "../types";

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function ProfilePage() {
  const auth = useAuth();
  const service = useMemo(() => getAccountService(), []);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(auth.profile?.username ?? "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await service.getPlayerStats(null, null));
      setError(null);
    } catch (caughtError) {
      console.error("[perfil] falha ao carregar estatísticas", caughtError);
      setError(getErrorMessage(caughtError));
    }
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setUsername(auth.profile?.username ?? "");
  }, [auth.profile?.username]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy || !isValidUsernameFormat(username)) {
      return;
    }

    setBusy(true);
    setFeedback(null);
    const saved = await auth.setUsername(username.trim());
    setBusy(false);

    if (saved) {
      setEditing(false);
      setFeedback("Nome de usuário atualizado.");
    }
  }

  const profile = auth.profile;
  const displayName = profile?.username ?? profile?.displayName ?? "";
  const aggregate = stats?.stats;

  return (
    <div className="progress-layout">
      <header className="profile-hero">
        <span className="profile-avatar" aria-hidden="true">
          {getInitial(displayName)}
        </span>
        <div>
          <h1>{displayName}</h1>
          <p className="panel-subtitle">
            No Palavra Livre desde {formatDate(profile?.createdAt ?? null)}
          </p>
          {profile?.isAdmin ? <span className="tag-chip official">Administradora</span> : null}
        </div>
        {stats !== null ? <StreakBadge streak={stats.streak} /> : null}
      </header>

      <section className="account-section" aria-labelledby="profile-edit-title">
        <h2 id="profile-edit-title">Nome de usuário</h2>

        {editing ? (
          <form className="account-form inline" onSubmit={handleSubmit}>
            <div className="account-field">
              <label htmlFor="profile-username">Novo nome de usuário</label>
              <input
                id="profile-username"
                className="text-input"
                type="text"
                value={username}
                minLength={USERNAME_RULES.minLength}
                maxLength={USERNAME_RULES.maxLength}
                disabled={busy}
                onChange={(event) => setUsername(event.target.value)}
                aria-describedby="profile-username-hint"
              />
              <small id="profile-username-hint">{USERNAME_RULES.hint}</small>
            </div>

            {auth.error !== null ? (
              <p className="panel-error" role="alert">
                {auth.error}
              </p>
            ) : null}

            <div className="panel-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={busy || !isValidUsernameFormat(username)}
              >
                {busy ? "Salvando..." : "Salvar"}
              </button>
              <button
                className="ghost-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setUsername(profile?.username ?? "");
                  auth.clearError();
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="panel-actions">
            <button className="secondary-button" type="button" onClick={() => setEditing(true)}>
              Editar nome de usuário
            </button>
          </div>
        )}

        {feedback !== null ? (
          <p className="panel-footnote" role="status">
            {feedback}
          </p>
        ) : null}

        <p className="admin-section-hint">
          E-mail e senha são gerenciados com segurança pelo Supabase e não aparecem aqui.
          Para trocar a senha, use{" "}
          <Link to={ACCOUNT_ROUTES.recoverPassword}>recuperar senha</Link>.
        </p>
      </section>

      {aggregate !== undefined ? (
        <>
          <section className="account-section" aria-labelledby="profile-stats-title">
            <h2 id="profile-stats-title">Seus números</h2>
            <dl className="stat-grid">
              <div>
                <dt>Sequência atual</dt>
                <dd>{stats?.streak.current ?? 0}</dd>
              </div>
              <div>
                <dt>Maior sequência</dt>
                <dd>{stats?.streak.longest ?? 0}</dd>
              </div>
              <div>
                <dt>Partidas jogadas</dt>
                <dd>{aggregate.games}</dd>
              </div>
              <div>
                <dt>Partidas completas</dt>
                <dd>{aggregate.completedGames}</dd>
              </div>
              <div>
                <dt>Palavras descobertas</dt>
                <dd>{aggregate.wordsSolved}</dd>
              </div>
              <div>
                <dt>Dias ativos</dt>
                <dd>{aggregate.activeDays}</dd>
              </div>
            </dl>
          </section>

          <section className="account-section" aria-labelledby="profile-championship-title">
            <h2 id="profile-championship-title">Campeonato Diário</h2>
            <dl className="stat-grid">
              <div>
                <dt>Disputados</dt>
                <dd>{aggregate.championship.played}</dd>
              </div>
              <div>
                <dt>Vitórias</dt>
                <dd>{aggregate.championship.wins}</dd>
              </div>
              <div>
                <dt>Pódios</dt>
                <dd>{aggregate.championship.podiums}</dd>
              </div>
              <div>
                <dt>Melhor posição</dt>
                <dd>
                  {aggregate.championship.bestPosition === null
                    ? "—"
                    : `${aggregate.championship.bestPosition}º`}
                </dd>
              </div>
              <div>
                <dt>Melhor pontuação</dt>
                <dd>{formatScore(aggregate.championship.bestScore)}</dd>
              </div>
            </dl>
            <div className="panel-actions">
              <Link className="ghost-button" to={ACCOUNT_ROUTES.championshipHistory}>
                Ver histórico de campeonatos
              </Link>
            </div>
          </section>
        </>
      ) : null}

      {error !== null ? (
        <p className="panel-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
