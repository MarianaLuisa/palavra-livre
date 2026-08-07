import { useEffect, useState, type FormEvent } from "react";
import { Link, navigate } from "../../router/router";
import { useAuth } from "../AuthProvider";
import { ACCOUNT_ROUTES, PASSWORD_RULES, USERNAME_RULES } from "../config";
import { isValidUsernameFormat } from "../username";

export function SignUpPage() {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(false);

  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate(ACCOUNT_ROUTES.progress, { replace: true });
    }
  }, [auth.isAuthenticated]);

  const usernameLooksValid = username === "" || isValidUsernameFormat(username);
  const passwordsMatch =
    passwordConfirmation === "" || password === passwordConfirmation;
  const canSubmit =
    isValidUsernameFormat(username) &&
    email.includes("@") &&
    password.length >= PASSWORD_RULES.minLength &&
    password === passwordConfirmation;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy || !canSubmit) {
      return;
    }

    setBusy(true);
    const result = await auth.signUp({
      username: username.trim(),
      email: email.trim(),
      password,
      passwordConfirmation,
    });
    setBusy(false);

    if (result === null) {
      return;
    }

    if (result.status === "CONFIRMATION_REQUIRED") {
      setConfirmationRequired(true);
      return;
    }

    navigate(ACCOUNT_ROUTES.progress, { replace: true });
  }

  if (confirmationRequired) {
    return (
      <section className="account-panel" aria-labelledby="signup-confirm-title">
        <header className="panel-header">
          <h1 id="signup-confirm-title">Confirme seu e-mail</h1>
        </header>
        <p className="panel-notice">
          Enviamos um link de confirmação para <strong>{email}</strong>. Clique nele para
          ativar a conta e depois volte para entrar.
        </p>
        <p className="panel-footnote">
          Não chegou? Verifique a caixa de spam antes de tentar de novo.
        </p>
        <Link className="primary-button" to={ACCOUNT_ROUTES.login}>
          Ir para o login
        </Link>
      </section>
    );
  }

  return (
    <section className="account-panel" aria-labelledby="signup-title">
      <header className="panel-header">
        <p className="eyebrow">Palavra Livre</p>
        <h1 id="signup-title">Criar conta</h1>
        <p className="panel-subtitle">
          Sua conta guarda o histórico de partidas, a sequência de dias e o desempenho no
          Campeonato Diário.
        </p>
      </header>

      {auth.isAnonymous ? (
        <p className="panel-notice">
          Você já está jogando sem conta. Ao criar uma agora, tudo que você já fez continua
          seu: o histórico e a inscrição no campeonato são preservados.
        </p>
      ) : null}

      <form className="account-form" onSubmit={handleSubmit}>
        <div className="account-field">
          <label htmlFor="signup-username">Nome de usuário</label>
          <input
            id="signup-username"
            className="text-input"
            type="text"
            autoComplete="nickname"
            required
            minLength={USERNAME_RULES.minLength}
            maxLength={USERNAME_RULES.maxLength}
            value={username}
            disabled={busy}
            aria-describedby="signup-username-hint"
            aria-invalid={!usernameLooksValid}
            onChange={(event) => setUsername(event.target.value)}
          />
          <small id="signup-username-hint" className={usernameLooksValid ? "" : "field-error"}>
            {USERNAME_RULES.hint}
          </small>
        </div>

        <div className="account-field">
          <label htmlFor="signup-email">E-mail</label>
          <input
            id="signup-email"
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
          <label htmlFor="signup-password">Senha</label>
          <input
            id="signup-password"
            className="text-input"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_RULES.minLength}
            value={password}
            disabled={busy}
            aria-describedby="signup-password-hint"
            onChange={(event) => setPassword(event.target.value)}
          />
          <small id="signup-password-hint">{PASSWORD_RULES.hint}</small>
        </div>

        <div className="account-field">
          <label htmlFor="signup-password-confirmation">Confirmar senha</label>
          <input
            id="signup-password-confirmation"
            className="text-input"
            type="password"
            autoComplete="new-password"
            required
            value={passwordConfirmation}
            disabled={busy}
            aria-invalid={!passwordsMatch}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
          />
          {!passwordsMatch ? (
            <small className="field-error">As senhas não conferem.</small>
          ) : null}
        </div>

        {auth.error !== null ? (
          <p className="panel-error" role="alert">
            {auth.error}
          </p>
        ) : null}

        <button className="primary-button" type="submit" disabled={busy || !canSubmit}>
          {busy ? "Criando conta..." : "Criar conta"}
        </button>
      </form>

      <nav className="account-links" aria-label="Já tem conta">
        <Link to={ACCOUNT_ROUTES.login}>Já tenho conta</Link>
      </nav>
    </section>
  );
}
