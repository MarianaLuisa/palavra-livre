import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../championship/supabaseClient";
import { Link, navigate } from "../../router/router";
import { useAuth } from "../AuthProvider";
import { ACCOUNT_ROUTES, PASSWORD_RULES } from "../config";

/**
 * Recuperação de senha em duas etapas na mesma rota:
 *
 *   1. sem tokens na URL: formulário que dispara o e-mail;
 *   2. voltando do link do e-mail, o Supabase anexa os tokens no fragmento
 *      (#access_token=...&type=recovery) e mostramos o formulário de nova senha.
 */
function readRecoveryTokens(): { accessToken: string; refreshToken: string } | null {
  if (typeof window === "undefined") {
    return null;
  }

  const fragment = window.location.hash.replace(/^#/, "");

  if (fragment.length === 0) {
    return null;
  }

  const params = new URLSearchParams(fragment);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (accessToken === null || refreshToken === null) {
    return null;
  }

  return { accessToken, refreshToken };
}

export function RecoverPasswordPage() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [stage, setStage] = useState<"REQUEST" | "RESET" | "DONE">("REQUEST");
  const [localError, setLocalError] = useState<string | null>(null);

  // Chegou pelo link do e-mail: adota os tokens e pede a nova senha.
  useEffect(() => {
    const tokens = readRecoveryTokens();

    if (tokens === null) {
      return;
    }

    const client = getSupabaseClient();

    if (client === null) {
      return;
    }

    let active = true;

    client
      .adoptTokens(tokens.accessToken, tokens.refreshToken)
      .then(() => {
        if (!active) {
          return;
        }

        // Limpa o fragmento para o token não ficar visível na barra.
        window.history.replaceState({}, "", window.location.pathname);
        setStage("RESET");
        void auth.refreshProfile();
      })
      .catch((error) => {
        console.error("[auth] link de recuperação inválido", error);

        if (active) {
          setLocalError("Link de recuperação inválido ou expirado. Peça outro.");
        }
      });

    return () => {
      active = false;
    };
  }, [auth]);

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) {
      return;
    }

    setBusy(true);
    const redirectTo =
      typeof window === "undefined"
        ? undefined
        : `${window.location.origin}${ACCOUNT_ROUTES.recoverPassword}`;
    const sent = await auth.requestPasswordReset(email, redirectTo);
    setBusy(false);

    if (sent) {
      setEmailSent(true);
    }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (busy) {
      return;
    }

    if (password !== passwordConfirmation) {
      setLocalError("As senhas não conferem.");
      return;
    }

    setBusy(true);
    const updated = await auth.updatePassword(password);
    setBusy(false);

    if (updated) {
      setStage("DONE");
    }
  }

  if (stage === "DONE") {
    return (
      <section className="account-panel">
        <header className="panel-header">
          <h1>Senha atualizada</h1>
        </header>
        <p className="panel-notice">Você já pode usar a nova senha para entrar.</p>
        <Link className="primary-button" to={ACCOUNT_ROUTES.progress}>
          Ir para o meu progresso
        </Link>
      </section>
    );
  }

  if (stage === "RESET") {
    return (
      <section className="account-panel" aria-labelledby="reset-title">
        <header className="panel-header">
          <h1 id="reset-title">Escolher nova senha</h1>
        </header>

        <form className="account-form" onSubmit={handleReset}>
          <div className="account-field">
            <label htmlFor="reset-password">Nova senha</label>
            <input
              id="reset-password"
              className="text-input"
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_RULES.minLength}
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
            <small>{PASSWORD_RULES.hint}</small>
          </div>

          <div className="account-field">
            <label htmlFor="reset-password-confirmation">Confirmar nova senha</label>
            <input
              id="reset-password-confirmation"
              className="text-input"
              type="password"
              autoComplete="new-password"
              required
              value={passwordConfirmation}
              disabled={busy}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
            />
          </div>

          {localError ?? auth.error ? (
            <p className="panel-error" role="alert">
              {localError ?? auth.error}
            </p>
          ) : null}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="account-panel" aria-labelledby="recover-title">
      <header className="panel-header">
        <h1 id="recover-title">Recuperar senha</h1>
        <p className="panel-subtitle">
          Enviamos um link para você escolher uma nova senha.
        </p>
      </header>

      {emailSent ? (
        <p className="panel-notice">
          Se existir uma conta com <strong>{email}</strong>, o link chegou por e-mail.
          Verifique também o spam.
        </p>
      ) : (
        <form className="account-form" onSubmit={handleRequest}>
          <div className="account-field">
            <label htmlFor="recover-email">E-mail</label>
            <input
              id="recover-email"
              className="text-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {localError ?? auth.error ? (
            <p className="panel-error" role="alert">
              {localError ?? auth.error}
            </p>
          ) : null}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Enviando..." : "Enviar link"}
          </button>
        </form>
      )}

      <nav className="account-links" aria-label="Voltar">
        <Link to={ACCOUNT_ROUTES.login}>Voltar para o login</Link>
      </nav>
    </section>
  );
}
