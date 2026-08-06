import { useEffect, useMemo } from "react";
import { Keyboard } from "../../components/Keyboard";
import type { GameStatus } from "../../types/game";
import { getKeyboardStatus } from "../../utils/keyboardStatus";
import { ChampionshipBoardGrid, toBoardState } from "../components/ChampionshipBoardGrid";
import { RoundProgress } from "../components/RoundProgress";
import { CHAMPIONSHIP_MODE_LABEL } from "../config";
import type { ChampionshipRoundState } from "../types";
import { useRevealingBoards } from "../useRevealingBoards";
import { useRoundInput } from "../useRoundInput";

type RoundPanelProps = {
  round: ChampionshipRoundState;
  rounds: ChampionshipRoundState[];
  previousRound: ChampionshipRoundState | null;
  busy: boolean;
  serverError: string | null;
  onStartRound: (roundId: string) => void;
  onSubmitAttempt: (roundId: string, word: string) => Promise<boolean>;
};

export function RoundPanel({
  round,
  rounds,
  previousRound,
  busy,
  serverError,
  onStartRound,
  onSubmitAttempt,
}: RoundPanelProps) {
  const started = round.status === "IN_PROGRESS";
  const attemptsLeft = Math.max(round.maxAttempts - round.attemptsUsed, 0);

  const input = useRoundInput({
    roundId: round.id,
    enabled: started && !busy,
    onSubmit: (word) => onSubmitAttempt(round.id, word),
  });

  const revealingBoards = useRevealingBoards(round.boards);

  // O teclado so incorpora a linha nova depois da animacao terminar,
  // igual ao Jogo Livre.
  const keyboardStatuses = useMemo(() => {
    const boardsForKeyboard = round.boards.map((board) => {
      const boardState = toBoardState(board);

      if (!input.isRevealing || !revealingBoards.includes(board.boardIndex)) {
        return boardState;
      }

      return { ...boardState, rows: boardState.rows.slice(0, -1) };
    });

    return getKeyboardStatus(boardsForKeyboard);
  }, [input.isRevealing, revealingBoards, round.boards]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const target = event.target;
      const isTextField =
        target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

      if (isTextField) {
        return;
      }

      if (input.handleKey(event.key)) {
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [input]);

  const gameStatus: GameStatus = started ? "playing" : "won";
  const message = input.message.length > 0 ? input.message : (serverError ?? "");

  if (!started) {
    return (
      <section className="championship-panel" aria-labelledby="round-start-title">
        <header className="panel-header">
          <h1 id="round-start-title">Modalidade {round.roundOrder} de {rounds.length}</h1>
          <p className="panel-subtitle">{CHAMPIONSHIP_MODE_LABEL[round.mode]}</p>
        </header>

        <RoundProgress rounds={rounds} currentRoundId={round.id} />

        {previousRound !== null ? (
          <div className="transition-summary" aria-label="Resultado da modalidade anterior">
            <h2>{CHAMPIONSHIP_MODE_LABEL[previousRound.mode]} concluido</h2>
            <p>
              {previousRound.wordsSolved}/{previousRound.boardCount} palavras ·{" "}
              {previousRound.attemptsUsed}/{previousRound.maxAttempts} tentativas ·{" "}
              {previousRound.totalScore} pontos
              {previousRound.bonusScore > 0 ? ` (inclui ${previousRound.bonusScore} de bonus)` : ""}
            </p>
            {previousRound.boards.some((board) => board.answer !== null) ? (
              <p className="transition-answers">
                Respostas:{" "}
                {previousRound.boards
                  .map((board) => board.answer ?? "?")
                  .join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}

        <dl className="panel-grid">
          <div>
            <dt>Palavras</dt>
            <dd>{round.boardCount}</dd>
          </div>
          <div>
            <dt>Tentativas</dt>
            <dd>{round.maxAttempts}</dd>
          </div>
          <div>
            <dt>Pontos possiveis</dt>
            <dd>{round.boardCount * 100} + bonus</dd>
          </div>
        </dl>

        <p className="panel-notice">
          O cronometro desta modalidade comeca quando voce clicar em iniciar.
        </p>

        <button
          className="primary-button"
          type="button"
          onClick={() => onStartRound(round.id)}
          disabled={busy}
        >
          {busy ? "Abrindo..." : `Iniciar ${CHAMPIONSHIP_MODE_LABEL[round.mode]}`}
        </button>
        {serverError !== null ? <p className="panel-error" role="alert">{serverError}</p> : null}
      </section>
    );
  }

  return (
    <section className="championship-round" aria-labelledby="round-title">
      <header className="round-header">
        <h1 id="round-title" className="visually-hidden">
          {CHAMPIONSHIP_MODE_LABEL[round.mode]}
        </h1>
        <RoundProgress rounds={rounds} currentRoundId={round.id} />
        <div className="status-panel" aria-label="Situacao da modalidade">
          <div>
            <span>Modalidade</span>
            <strong>{CHAMPIONSHIP_MODE_LABEL[round.mode]}</strong>
          </div>
          <div>
            <span>Tentativas</span>
            <strong>
              {round.attemptsUsed}/{round.maxAttempts}
            </strong>
          </div>
          <div>
            <span>Restantes</span>
            <strong>{attemptsLeft}</strong>
          </div>
          <div>
            <span>Resolvidas</span>
            <strong>
              {round.wordsSolved}/{round.boardCount}
            </strong>
          </div>
        </div>
      </header>

      <div
        className={message.length > 0 ? "message visible" : "message"}
        key={`${input.messageId}-${serverError ?? ""}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>

      <ChampionshipBoardGrid
        boards={round.boards}
        currentGuessLetters={input.letters}
        activeTileIndex={input.activeTileIndex}
        maxAttempts={round.maxAttempts}
        gameStatus={gameStatus}
        isRevealing={input.isRevealing}
        revealingBoards={revealingBoards}
        onTileSelect={input.selectTile}
      />

      <Keyboard
        keyStatuses={keyboardStatuses}
        disabled={busy || input.isRevealing}
        onKey={input.handleKey}
      />
    </section>
  );
}
