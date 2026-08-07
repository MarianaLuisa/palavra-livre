import { useEffect, useState } from "react";
import { useGameSync } from "../account/useGameSync";
import { EndGameModal } from "../components/EndGameModal";
import { GameBoardGrid } from "../components/GameBoardGrid";
import { Keyboard } from "../components/Keyboard";
import { ModeSelector } from "../components/ModeSelector";
import { RulesModal } from "../components/RulesModal";
import { SiteHeader } from "../components/SiteHeader";
import { StatsModal } from "../components/StatsModal";
import { useGame } from "../hooks/useGame";
import type { GameMode, ThemeMode } from "../types/game";
import { MODES } from "../utils/constants";

/**
 * Jogo Livre: exatamente a experiencia original, com partidas ilimitadas.
 * Nenhuma regra do modo tradicional foi alterada pela nova modalidade.
 */
type FreePlayPageProps = {
  theme: ThemeMode;
  onToggleTheme: () => void;
};

export function FreePlayPage({ theme, onToggleTheme }: FreePlayPageProps) {
  const { recordFinishedGame } = useGameSync();
  // Visitante joga igual a sempre; com conta, cada partida concluida
  // e registrada no servidor de forma idempotente.
  const game = useGame({ onGameFinished: recordFinishedGame });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [endGameOpen, setEndGameOpen] = useState(false);

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

  const restartLabel = game.isRevealing
    ? "Revelando..."
    : game.canRestart
      ? "Jogar novamente"
      : game.status === "playing"
        ? "Termine a partida"
        : `Complete os 4 modos (${game.cycleProgress.completed}/${game.cycleProgress.total})`;
  const nextModes = MODES.filter(
    (mode) => !game.cycleProgress.completedModes.includes(mode),
  );
  const headerControls = (
    <div className="site-control-content free-play-header-controls">
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
      </section>
      <button
        className="secondary-button compact"
        type="button"
        onClick={handlePlayAgain}
        disabled={!game.canRestart}
        title={
          game.canRestart
            ? "Começar novo ciclo"
            : "Disponível depois de concluir Simples, Dueto, Quarteto e Sexteto"
        }
        aria-label="Jogar novamente com novas palavras"
      >
        {restartLabel}
      </button>
      <nav className="header-actions" aria-label="Ajuda e estatísticas">
        <button
          className="tool-button"
          type="button"
          onClick={() => {
            setRulesOpen(true);
          }}
        >
          Regras
        </button>
        <button
          className="tool-button"
          type="button"
          onClick={() => {
            setStatsOpen(true);
          }}
        >
          Estatísticas
        </button>
      </nav>
    </div>
  );

  return (
    <div className={`free-play-game-shell boards-${game.config.boardCount}`}>
      <SiteHeader
        theme={theme}
        onToggleTheme={onToggleTheme}
        controlLabel="Partida"
        controlSummary={`${game.config.label} · ${game.attempt}/${game.config.maxAttempts} · ${game.solvedCount}/${game.config.boardCount}`}
        controlContent={headerControls}
      />

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
          invalidGuessId={game.invalidGuessId}
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
        nextModes={nextModes}
        onPlayAgain={handlePlayAgain}
        onSelectMode={handleChangeMode}
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

