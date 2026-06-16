import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import type { BoardState, GameMode, GameStatus } from "../types/game";
import { MODE_CONFIG } from "../utils/constants";
import { createShareText } from "../utils/shareResult";

type EndGameModalProps = {
  open: boolean;
  status: GameStatus;
  mode: GameMode;
  attemptsUsed: number;
  boards: BoardState[];
  onPlayAgain: () => void;
  onClose: () => void;
};

export function EndGameModal({
  open,
  status,
  mode,
  attemptsUsed,
  boards,
  onPlayAgain,
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
      setCopyMessage("Nao foi possivel acessar a area de transferencia.");
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
        <h2 id="end-game-title">{won ? "Vitoria!" : "Fim de jogo"}</h2>
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
              {index + 1}. {board.answer.toUpperCase()}
            </span>
          ))}
        </div>
        <div className="modal-actions">
          <button className="primary-button" type="button" onClick={onPlayAgain}>
            Jogar novamente
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
