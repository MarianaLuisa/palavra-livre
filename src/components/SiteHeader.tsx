import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccountMenu } from "../account/components/AccountMenu";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_ROUTES, FREE_PLAY_BRAND } from "../championship/config";
import { Link, usePathname } from "../router/router";
import type { ThemeMode } from "../types/game";

type SiteHeaderProps = {
  theme: ThemeMode;
  onToggleTheme: () => void;
  controlLabel?: string;
  controlSummary?: string;
  controlContent?: ReactNode;
};

const NAV_ITEMS = [
  { to: CHAMPIONSHIP_ROUTES.championship, label: CHAMPIONSHIP_BRAND.shortName },
  { to: CHAMPIONSHIP_ROUTES.leaderboard, label: "Classificação" },
  { to: CHAMPIONSHIP_ROUTES.history, label: "Histórico" },
  { to: CHAMPIONSHIP_ROUTES.freePlay, label: FREE_PLAY_BRAND.shortName },
];

/** Cabecalho global usado em todas as telas principais. */
export function SiteHeader({
  theme,
  onToggleTheme,
  controlLabel = "Partida",
  controlSummary,
  controlContent,
}: SiteHeaderProps) {
  const pathname = usePathname();
  const [controlOpen, setControlOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const nextThemeLabel = theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro";

  useEffect(() => {
    if (!controlOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (
        headerRef.current !== null &&
        event.target instanceof Node &&
        !headerRef.current.contains(event.target)
      ) {
        setControlOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setControlOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [controlOpen]);

  return (
    <header className="site-header" ref={headerRef}>
      <div className="site-header-inner">
        <Link className="site-brand" to={CHAMPIONSHIP_ROUTES.home}>
          <img className="brand-mark" src="/palavra-livre.svg" alt="" />
          <span>Palavra Livre</span>
        </Link>

        <nav className="site-nav" aria-label="Navegação principal">
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

        {controlContent !== undefined && controlContent !== null ? (
          <div className="site-control-menu">
            <button
              className="site-control-trigger"
              type="button"
              aria-expanded={controlOpen}
              aria-haspopup="dialog"
              onClick={() => setControlOpen((current) => !current)}
            >
              <span>{controlLabel}</span>
              {controlSummary !== undefined ? <small>{controlSummary}</small> : null}
            </button>
            <div
              className={controlOpen ? "site-control-dropdown open" : "site-control-dropdown"}
              role="dialog"
              aria-label="Controles da partida"
              onClick={(event) => {
                const target = event.target;
                if (target instanceof HTMLElement && target.closest("button,a")) {
                  setControlOpen(false);
                }
              }}
            >
              {controlContent}
            </div>
          </div>
        ) : null}

        <div className="site-header-actions">
          <AccountMenu />
          <button
            className="tool-button icon-button"
            type="button"
            onClick={onToggleTheme}
            aria-label={nextThemeLabel}
            title={nextThemeLabel}
          >
            {theme === "dark" ? "Claro" : "Escuro"}
          </button>
        </div>
      </div>
    </header>
  );
}
