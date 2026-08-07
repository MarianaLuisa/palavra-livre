import { useEffect, useRef, type MouseEvent } from "react";
import { CHAMPIONSHIP_MODE_LABEL } from "../config";
import { formatDuration } from "../format";
import type { ChampionshipRoundState } from "../types";
import { repairMojibake } from "../../utils/repairMojibake";

type RoundCompletionModalProps = {
  round: ChampionshipRoundState;
  /** Existe uma proxima modalidade depois desta. */
  nextRoundLabel: string | null;
  onClose: () => void;
};

/** Frase de abertura variando com o desempenho, sem soar automática. */
function getHeadline(round: ChampionshipRoundState): string {
  if (!round.allWordsSolved) {
    return "Modalidade encerrada";
  }

  const attemptsLeft = round.maxAttempts - round.attemptsUsed;

  if (round.attemptsUsed === 1) {
    return "De primeira!";
  }

  if (attemptsLeft >= Math.ceil(round.maxAttempts / 2)) {
    return "Muito bem!";
  }

  return "Modalidade concluída!";
}

export function RoundCompletionModal({
  round,
  nextRoundLabel,
  onClose,
}: RoundCompletionModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const solvedAll = round.allWordsSolved;
  const attemptsLeft = Math.max(round.maxAttempts - round.attemptsUsed, 0);
  const answers = round.boards
    .map((board) => board.answer)
    .filter((answer): answer is string => answer !== null)
    .map(repairMojibake);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <section
        className={solvedAll ? "modal round-done won" : "modal round-done lost"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="round-done-title"
      >
        <span className="round-done-badge" aria-hidden="true">
          {solvedAll ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M4 12.5 9.5 18 20 6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M12 6v8" strokeLinecap="round" />
              <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
            </svg>
          )}
        </span>

        <p className="eyebrow">{CHAMPIONSHIP_MODE_LABEL[round.mode]}</p>
        <h2 id="round-done-title">{getHeadline(round)}</h2>

        <dl className="round-done-stats">
          <div>
            <dt>Palavras</dt>
            <dd>
              {round.wordsSolved}/{round.boardCount}
            </dd>
          </div>
          <div>
            <dt>Tentativas</dt>
            <dd>
              {round.attemptsUsed}/{round.maxAttempts}
            </dd>
          </div>
          <div className="round-done-score">
            <dt>Pontos</dt>
            <dd>{round.totalScore}</dd>
          </div>
        </dl>

        {solvedAll && round.bonusScore > 0 ? (
          <p className="round-done-bonus">
            {round.baseScore} pelas palavras + <strong>{round.bonusScore} de bônus</strong> por{" "}
            {attemptsLeft} {attemptsLeft === 1 ? "tentativa restante" : "tentativas restantes"}
          </p>
        ) : null}

        {answers.length > 0 ? (
          <p className="round-done-answers">
            <span>{answers.length === 1 ? "Resposta" : "Respostas"}</span>
            <strong>{answers.join(" · ")}</strong>
          </p>
        ) : null}

        <button ref={closeRef} className="primary-button" type="button" onClick={onClose}>
          {nextRoundLabel === null ? "Ver meu resultado" : `Continuar para ${nextRoundLabel}`}
        </button>
      </section>
    </div>
  );
}
