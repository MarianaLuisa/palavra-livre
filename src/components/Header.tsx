import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { ThemeMode } from "../types/game";

type HeaderProps = {
  theme: ThemeMode;
  summary: string;
  children: ReactNode;
  /** Botoes proprios do Jogo Livre. Omitidos, nao aparecem. */
  onOpenRules?: () => void;
  onOpenStats?: () => void;
  /** Acoes extras dentro do menu, usadas pelo campeonato. */
  actions?: ReactNode;
  onToggleTheme: () => void;
};

export function Header({
  theme,
  summary,
  children,
  onOpenRules,
  onOpenStats,
  actions,
  onToggleTheme,
}: HeaderProps) {
  const nextThemeLabel = theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro";
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function runMenuAction(action: () => void) {
    action();
    setMenuOpen(false);
  }

  function closeAfterModeClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (target instanceof Element && target.closest(".mode-button")) {
      setMenuOpen(false);
    }
  }

  return (
    <header className="app-header" ref={headerRef}>
      <button
        className="header-summary"
        type="button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label="Abrir menu do jogo"
        onClick={() => setMenuOpen((isOpen) => !isOpen)}
      >
        <span className="brand">
        <img className="brand-mark" src="/palavra-livre.svg" alt="" />
          <span>
            <small>{summary}</small>
            <strong>Palavra Livre</strong>
          </span>
        </span>
        <span className="menu-label">Menu</span>
      </button>

      <div
        className={menuOpen ? "header-menu open" : "header-menu"}
        aria-hidden={!menuOpen}
        onClick={closeAfterModeClick}
      >
        {children}
        {actions}
        <nav className="header-actions" aria-label="Ações do jogo">
          {onOpenRules !== undefined ? (
            <button
              className="tool-button"
              type="button"
              onClick={() => runMenuAction(onOpenRules)}
              aria-label="Abrir regras"
            >
              Regras
            </button>
          ) : null}
          {onOpenStats !== undefined ? (
            <button
              className="tool-button"
              type="button"
              onClick={() => runMenuAction(onOpenStats)}
              aria-label="Abrir estatísticas"
            >
              Estatísticas
            </button>
          ) : null}
          <button
            className="tool-button icon-button"
            type="button"
            onClick={() => runMenuAction(onToggleTheme)}
            aria-label={nextThemeLabel}
            title={nextThemeLabel}
          >
            {theme === "dark" ? "Claro" : "Escuro"}
          </button>
        </nav>
      </div>
    </header>
  );
}
