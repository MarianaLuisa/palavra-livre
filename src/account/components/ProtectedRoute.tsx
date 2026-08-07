import { useEffect, type ReactNode } from "react";
import { Link, navigate, usePathname } from "../../router/router";
import { useAuth } from "../AuthProvider";
import { ACCOUNT_ROUTES, REDIRECT_PARAM } from "../config";

/**
 * Protege as áreas pessoais.
 *
 * Isto é conveniência de navegação, não segurança: quem chamar as RPCs
 * direto recebe NOT_AUTHENTICATED, e a RLS filtra por auth.uid().
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!auth.configured || auth.loading || auth.isAuthenticated) {
      return;
    }

    // Guarda o destino para voltar depois do login.
    const target = `${ACCOUNT_ROUTES.login}?${REDIRECT_PARAM}=${encodeURIComponent(pathname)}`;
    navigate(target, { replace: true });
  }, [auth.configured, auth.isAuthenticated, auth.loading, pathname]);

  if (!auth.configured) {
    return (
      <section className="account-panel">
        <header className="panel-header">
          <h1>Contas indisponíveis</h1>
        </header>
        <p className="panel-notice">
          Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> para
          habilitar contas e progresso.
        </p>
        <Link className="primary-button" to="/">
          Voltar ao início
        </Link>
      </section>
    );
  }

  if (auth.loading) {
    return (
      <section className="account-panel">
        <p className="loading-state">Carregando sua conta...</p>
      </section>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <section className="account-panel">
        <p className="loading-state">Redirecionando para o login...</p>
      </section>
    );
  }

  return <>{children}</>;
}
