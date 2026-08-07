import { useEffect, useState, type FormEvent } from "react";
import { Link, navigate } from "../../router/router";
import { useAuth } from "../AuthProvider";
import { ACCOUNT_ROUTES, REDIRECT_PARAM } from "../config";

/** Destino guardado na URL quando uma rota protegida exigiu login. */
function getRedirectTarget(): string {
  if (typeof window === "undefined") {
    return ACCOUNT_ROUTES.progress;
  }

  const target = new URLSearchParams(window.location.search).get(REDIRECT_PARAM);

  // Só aceita caminho interno, para não virar redirecionamento aberto.
  if (target !== null && target.startsWith("/") && !target.startsWith("//")) {
    return target;
  }

  return ACCOUNT_ROUTES.progress;
}

export function LoginPage() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Já autenticado: sai da tela de login.
  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate(getRedirectTarget(), { replace: true });
    }
  }, [auth.isAuthenticated]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) {
      return;
    }

    setBusy(true);
    const signedIn = await auth.signIn(email, password);
    setBusy(false);

    if (signedIn) {
      navigate(getRedirectTarget(), { replace: true });
    }
  }

  return (
    <section className="account-panel" aria-labelledby="login-title">
      <header className="panel-header">
        <p className="eyebrow">Palavra Livre</p>
        <h1 id="login-title">Entrar</h1>
        <p className="panel-subtitle">
          Acompanhe sua sequência, seu calendário e suas estatísticas.
        </p>
      </header>

      <form className="account-form" onSubmit={handleSubmit}>
        <div className="account-field">
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            className="text-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="account-field">
          <label htmlFor="login-password">Senha</label>
          <input
            id="login-password"
            className="text-input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {auth.error !== null ? (
          <p className="panel-error" role="alert">
            {auth.error}
          </p>
        ) : null}

        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <nav className="account-links" aria-label="Outras opções de acesso">
        <Link to={ACCOUNT_ROUTES.recoverPassword}>Esqueci minha senha</Link>
        <Link to={ACCOUNT_ROUTES.signUp}>Criar conta</Link>
      </nav>
    </section>
  );
}
