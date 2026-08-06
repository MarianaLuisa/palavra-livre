import { useCallback, useEffect } from "react";
import { AdminPage } from "./championship/pages/AdminPage";
import { ChampionshipPage } from "./championship/pages/ChampionshipPage";
import { HistoryPage } from "./championship/pages/HistoryPage";
import { LeaderboardPage } from "./championship/pages/LeaderboardPage";
import { CHAMPIONSHIP_ROUTES } from "./championship/config";
import { SiteHeader } from "./components/SiteHeader";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { FreePlayPage } from "./pages/FreePlayPage";
import { HomePage } from "./pages/HomePage";
import { Link, usePathname } from "./router/router";
import type { ThemeMode } from "./types/game";
import { THEME_STORAGE_KEY } from "./utils/constants";

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function NotFoundPage() {
  return (
    <section className="championship-panel">
      <header className="panel-header">
        <h1>Pagina nao encontrada</h1>
      </header>
      <p className="panel-notice">O endereco acessado nao existe no Palavra Livre.</p>
      <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.home}>
        Voltar ao inicio
      </Link>
    </section>
  );
}

export function App() {
  const [theme, setTheme] = useLocalStorage<ThemeMode>(THEME_STORAGE_KEY, "dark");
  const pathname = normalizePath(usePathname());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }, [setTheme]);

  // O Jogo Livre mantem o layout e o cabecalho originais.
  if (pathname === normalizePath(CHAMPIONSHIP_ROUTES.freePlay)) {
    return (
      <div className="app-shell">
        <FreePlayPage theme={theme} onToggleTheme={handleToggleTheme} />
      </div>
    );
  }

  if (pathname === normalizePath(CHAMPIONSHIP_ROUTES.home)) {
    return (
      <div className="app-shell home-shell">
        <SiteHeader theme={theme} onToggleTheme={handleToggleTheme} />
        <HomePage />
      </div>
    );
  }

  const page =
    pathname === normalizePath(CHAMPIONSHIP_ROUTES.championship) ? (
      <ChampionshipPage />
    ) : pathname === normalizePath(CHAMPIONSHIP_ROUTES.leaderboard) ? (
      <LeaderboardPage />
    ) : pathname === normalizePath(CHAMPIONSHIP_ROUTES.history) ? (
      <HistoryPage />
    ) : pathname === normalizePath(CHAMPIONSHIP_ROUTES.admin) ? (
      <AdminPage />
    ) : (
      <NotFoundPage />
    );

  return (
    <div className="app-shell championship-shell">
      <SiteHeader theme={theme} onToggleTheme={handleToggleTheme} />
      <main className="championship-layout">{page}</main>
    </div>
  );
}
