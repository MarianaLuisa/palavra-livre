import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import type { BoardState, GameMode, GameStatus } from "../types/game";
import { MODE_CONFIG } from "../utils/constants";
import { repairMojibake } from "../utils/repairMojibake";
import { createShareText } from "../utils/shareResult";

type EndGameModalProps = {
  open: boolean;
  status: GameStatus;
  mode: GameMode;
  attemptsUsed: number;
  boards: BoardState[];
  canPlayAgain: boolean;
  playAgainLabel: string;
  nextModes: GameMode[];
  onPlayAgain: () => void;
  onSelectMode: (mode: GameMode) => void;
  onClose: () => void;
};

export function EndGameModal({
  open,
  status,
  mode,
  attemptsUsed,
  boards,
  canPlayAgain,
  playAgainLabel,
  nextModes,
  onPlayAgain,
  onSelectMode,
  onClose,
}: EndGameModalProps) {
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setCopyMessage("");
    }
  }, [open]);

  if (!open || status === "playing") {
    return null;
  }

  const won = status === "won";
  const config = MODE_CONFIG[mode];

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  async function copyResult() {
    const result = createShareText(mode, status, attemptsUsed, boards);

    if (!("clipboard" in navigator)) {
      setCopyMessage("Não foi possível acessar a área de transferência.");
      return;
    }

    await navigator.clipboard.writeText(result);
    setCopyMessage("Resultado copiado");
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <section
        className="modal result-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-game-title"
      >
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          x
        </button>
        <p className="eyebrow">{config.label}</p>
        <h2 id="end-game-title">{won ? "Vitória!" : "Fim de jogo"}</h2>
        <p className="modal-copy">
          {won
            ? `Todas as palavras foram resolvidas em ${attemptsUsed} tentativa${
                attemptsUsed === 1 ? "" : "s"
              }.`
            : `As tentativas acabaram em ${attemptsUsed} rodadas.`}
        </p>
        <div className="answer-list" aria-label="Palavras corretas">
          {boards.map((board, index) => (
            <span key={board.answer}>
              {index + 1}. {repairMojibake(board.answer).normalize("NFC").toUpperCase()}
            </span>
          ))}
        </div>
        {nextModes.length > 0 ? (
          <div className="next-mode-panel">
            <p>Continue o ciclo</p>
            <div className="next-mode-actions">
              {nextModes.map((nextMode) => (
                <button
                  className="secondary-button"
                  key={nextMode}
                  type="button"
                  onClick={() => onSelectMode(nextMode)}
                >
                  {MODE_CONFIG[nextMode].label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="modal-actions">
          <button
            className="primary-button"
            type="button"
            onClick={onPlayAgain}
            disabled={!canPlayAgain}
          >
            {playAgainLabel}
          </button>
          <button className="secondary-button" type="button" onClick={() => void copyResult()}>
            Copiar resultado
          </button>
        </div>
        <p className={copyMessage ? "copy-feedback visible" : "copy-feedback"} role="status">
          {copyMessage}
        </p>
      </section>
    </div>
  );
}
