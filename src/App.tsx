import { useCallback, useEffect } from "react";
import { AuthProvider } from "./account/AuthProvider";
import { ProtectedRoute } from "./account/components/ProtectedRoute";
import { ACCOUNT_ROUTES } from "./account/config";
import { ChampionshipHistoryPage } from "./account/pages/ChampionshipHistoryPage";
import { LoginPage } from "./account/pages/LoginPage";
import { ProfilePage } from "./account/pages/ProfilePage";
import { ProgressPage } from "./account/pages/ProgressPage";
import { RecoverPasswordPage } from "./account/pages/RecoverPasswordPage";
import { SignUpPage } from "./account/pages/SignUpPage";
import { StatsPage } from "./account/pages/StatsPage";
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
        <h1>Página não encontrada</h1>
      </header>
      <p className="panel-notice">O endereço acessado não existe no Palavra Livre.</p>
      <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.home}>
        Voltar ao início
      </Link>
    </section>
  );
}

function AppRoutes({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const pathname = normalizePath(usePathname());

  if (pathname === normalizePath(CHAMPIONSHIP_ROUTES.freePlay)) {
    return (
      <div className="app-shell free-play-shell">
        <FreePlayPage theme={theme} onToggleTheme={onToggleTheme} />
      </div>
    );
  }

  if (pathname === normalizePath(CHAMPIONSHIP_ROUTES.championship)) {
    return (
      <div className="app-shell championship-game-shell">
        <ChampionshipPage theme={theme} onToggleTheme={onToggleTheme} />
      </div>
    );
  }

  if (pathname === normalizePath(CHAMPIONSHIP_ROUTES.home)) {
    return (
      <div className="app-shell home-shell">
        <SiteHeader theme={theme} onToggleTheme={onToggleTheme} />
        <HomePage />
      </div>
    );
  }

  const page =
    pathname === normalizePath(CHAMPIONSHIP_ROUTES.leaderboard) ? (
      <LeaderboardPage />
    ) : pathname === normalizePath(CHAMPIONSHIP_ROUTES.history) ? (
      <HistoryPage />
    ) : pathname === normalizePath(CHAMPIONSHIP_ROUTES.admin) ? (
      <AdminPage />
    ) : pathname === normalizePath(ACCOUNT_ROUTES.login) ? (
      <LoginPage />
    ) : pathname === normalizePath(ACCOUNT_ROUTES.signUp) ? (
      <SignUpPage />
    ) : pathname === normalizePath(ACCOUNT_ROUTES.recoverPassword) ? (
      <RecoverPasswordPage />
    ) : pathname === normalizePath(ACCOUNT_ROUTES.progress) ? (
      <ProtectedRoute>
        <ProgressPage />
      </ProtectedRoute>
    ) : pathname === normalizePath(ACCOUNT_ROUTES.stats) ? (
      <ProtectedRoute>
        <StatsPage />
      </ProtectedRoute>
    ) : pathname === normalizePath(ACCOUNT_ROUTES.profile) ? (
      <ProtectedRoute>
        <ProfilePage />
      </ProtectedRoute>
    ) : pathname === normalizePath(ACCOUNT_ROUTES.championshipHistory) ? (
      <ProtectedRoute>
        <ChampionshipHistoryPage />
      </ProtectedRoute>
    ) : (
      <NotFoundPage />
    );

  return (
    <div className="app-shell championship-shell">
      <SiteHeader theme={theme} onToggleTheme={onToggleTheme} />
      <main className="championship-layout">{page}</main>
    </div>
  );
}

export function App() {
  const [theme, setTheme] = useLocalStorage<ThemeMode>(THEME_STORAGE_KEY, "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }, [setTheme]);

  return (
    <AuthProvider>
      <AppRoutes theme={theme} onToggleTheme={handleToggleTheme} />
    </AuthProvider>
  );
}
