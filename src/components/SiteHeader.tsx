import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_ROUTES, FREE_PLAY_BRAND } from "../championship/config";
import { Link, usePathname } from "../router/router";
import type { ThemeMode } from "../types/game";

type SiteHeaderProps = {
  theme: ThemeMode;
  onToggleTheme: () => void;
};

const NAV_ITEMS = [
  { to: CHAMPIONSHIP_ROUTES.championship, label: CHAMPIONSHIP_BRAND.shortName },
  { to: CHAMPIONSHIP_ROUTES.leaderboard, label: "Classificacao" },
  { to: CHAMPIONSHIP_ROUTES.history, label: "Historico" },
  { to: CHAMPIONSHIP_ROUTES.freePlay, label: FREE_PLAY_BRAND.shortName },
];

/** Cabecalho das telas do campeonato. O Jogo Livre mantem o cabecalho proprio. */
export function SiteHeader({ theme, onToggleTheme }: SiteHeaderProps) {
  const pathname = usePathname();
  const nextThemeLabel = theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro";

  return (
    <header className="site-header">
      <Link className="site-brand" to={CHAMPIONSHIP_ROUTES.home}>
        <img className="brand-mark" src="/palavra-livre.svg" alt="" />
        <span>Palavra Livre</span>
      </Link>

      <nav className="site-nav" aria-label="Navegacao principal">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            className={pathname === item.to ? "site-nav-link active" : "site-nav-link"}
            to={item.to}
            aria-current={pathname === item.to ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <button
        className="tool-button icon-button"
        type="button"
        onClick={onToggleTheme}
        aria-label={nextThemeLabel}
        title={nextThemeLabel}
      >
        {theme === "dark" ? "Claro" : "Escuro"}
      </button>
    </header>
  );
}
