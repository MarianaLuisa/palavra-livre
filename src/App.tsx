import { useEffect, useState } from "react";
import { EndGameModal } from "./components/EndGameModal";
import { GameBoardGrid } from "./components/GameBoardGrid";
import { Header } from "./components/Header";
import { Keyboard } from "./components/Keyboard";
import { ModeSelector } from "./components/ModeSelector";
import { RulesModal } from "./components/RulesModal";
import { StatsModal } from "./components/StatsModal";
import { useGame } from "./hooks/useGame";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type { GameMode, ThemeMode } from "./types/game";
import { THEME_STORAGE_KEY } from "./utils/constants";

export function App() {
  const game = useGame();
  const [theme, setTheme] = useLocalStorage<ThemeMode>(THEME_STORAGE_KEY, "dark");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [endGameOpen, setEndGameOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (game.status !== "playing") {
      setEndGameOpen(true);
    }
  }, [game.status]);

  useEffect(() => {
    if (game.message.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      game.clearMessage();
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [game.message, game.messageId, game.clearMessage]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (rulesOpen || statsOpen || endGameOpen) {
        if (event.key === "Escape") {
          setRulesOpen(false);
          setStatsOpen(false);
          setEndGameOpen(false);
        }
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const target = event.target;
      const isTextField =
        target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

      if (isTextField) {
        return;
      }

      if (game.handleKey(event.key)) {
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [endGameOpen, game, rulesOpen, statsOpen]);

  function handleChangeMode(mode: GameMode) {
    if (game.changeMode(mode) !== false) {
      setEndGameOpen(false);
    }
  }

  function handlePlayAgain() {
    if (game.resetGame() !== false) {
      setEndGameOpen(false);
    }
  }

  function handleToggleTheme() {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }

  const restartLabel = game.isRevealing
    ? "Revelando..."
    : game.canRestart
      ? "Jogar novamente"
      : game.status === "playing"
        ? "Termine a partida"
        : `Complete os 4 modos (${game.cycleProgress.completed}/${game.cycleProgress.total})`;

  return (
    <div className="app-shell">
      <Header
        theme={theme}
        summary={`${game.config.label} · ${game.attempt}/${game.config.maxAttempts} · ${game.solvedCount}/${game.config.boardCount} · ciclo ${game.cycleProgress.completed}/${game.cycleProgress.total}`}
        onOpenRules={() => setRulesOpen(true)}
        onOpenStats={() => setStatsOpen(true)}
        onToggleTheme={handleToggleTheme}
      >
        <ModeSelector
          activeMode={game.mode}
          completedModes={game.cycleProgress.completedModes}
          disabled={!game.canChangeMode}
          onChangeMode={handleChangeMode}
        />
        <section className="status-panel" aria-label="Status da partida">
          <div>
            <span>Modo</span>
            <strong>{game.config.label}</strong>
          </div>
          <div>
            <span>Tentativas</span>
            <strong>
              {game.attempt}/{game.config.maxAttempts}
            </strong>
          </div>
          <div>
            <span>Resolvidas</span>
            <strong>
              {game.solvedCount}/{game.config.boardCount}
            </strong>
          </div>
          <button
            className="secondary-button compact"
            type="button"
            onClick={handlePlayAgain}
            disabled={!game.canRestart}
            title={
              game.canRestart
                ? "Comecar novo ciclo"
                : "Disponivel depois de concluir Simples, Dueto, Quarteto e Sexteto"
            }
            aria-label="Jogar novamente com novas palavras"
          >
            {restartLabel}
          </button>
        </section>
      </Header>
      <main className="game-layout">
        <div
          className={game.message ? "message visible" : "message"}
          key={game.messageId}
          role="status"
          aria-live="polite"
        >
          {game.message}
        </div>
        <GameBoardGrid
          boards={game.boards}
          currentGuessLetters={game.currentGuessLetters}
          activeTileIndex={game.activeTileIndex}
          maxAttempts={game.config.maxAttempts}
          gameStatus={game.status}
          isRevealing={game.isRevealing}
          revealingAnswers={game.revealingAnswers}
          onTileSelect={game.selectTile}
        />
      </main>
      <Keyboard
        keyStatuses={game.keyboardStatuses}
        disabled={game.isRevealing}
        onKey={game.handleKey}
      />
      <EndGameModal
        open={endGameOpen}
        status={game.status}
        mode={game.mode}
        attemptsUsed={game.attempt}
        boards={game.boards}
        canPlayAgain={game.canRestart}
        playAgainLabel={restartLabel}
        onPlayAgain={handlePlayAgain}
        onClose={() => setEndGameOpen(false)}
      />
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <StatsModal
        open={statsOpen}
        stats={game.stats}
        onClose={() => setStatsOpen(false)}
      />
    </div>
  );
}
