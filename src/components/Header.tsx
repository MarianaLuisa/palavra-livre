import type { ThemeMode } from "../types/game";

type HeaderProps = {
  theme: ThemeMode;
  onOpenRules: () => void;
  onOpenStats: () => void;
  onToggleTheme: () => void;
};

export function Header({ theme, onOpenRules, onOpenStats, onToggleTheme }: HeaderProps) {
  const nextThemeLabel = theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro";

  return (
    <header className="app-header">
      <div className="brand">
        <img className="brand-mark" src="/palavra-livre.svg" alt="" />
        <div>
          <p>Jogue sem limite diario</p>
          <h1>Palavra Livre</h1>
        </div>
      </div>
      <nav className="header-actions" aria-label="Acoes do jogo">
        <button
          className="tool-button"
          type="button"
          onClick={onOpenRules}
          aria-label="Abrir regras"
        >
          Regras
        </button>
        <button
          className="tool-button"
          type="button"
          onClick={onOpenStats}
          aria-label="Abrir estatisticas"
        >
          Estatisticas
        </button>
        <button
          className="tool-button icon-button"
          type="button"
          onClick={onToggleTheme}
          aria-label={nextThemeLabel}
          title={nextThemeLabel}
        >
          {theme === "dark" ? "Claro" : "Escuro"}
        </button>
      </nav>
    </header>
  );
}
