import { useEffect, useMemo } from "react";
import { Keyboard } from "../../components/Keyboard";
import type { GameStatus } from "../../types/game";
import { getKeyboardStatus } from "../../utils/keyboardStatus";
import { repairMojibake } from "../../utils/repairMojibake";
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
  /**
   * Mantem o tabuleiro visivel depois que a modalidade fecha, sem aceitar
   * digitacao. Serve para a animacao de revelacao da ultima linha terminar
   * antes da comemoracao aparecer.
   */
  reviewMode?: boolean;
  busy: boolean;
  serverError: string | null;
  onStartRound: (roundId: string) => void;
  onSubmitAttempt: (roundId: string, word: string) => Promise<boolean>;
};

/**
 * Durante a partida a tela mostra apenas mensagem, tabuleiro e teclado.
 * Progresso das modalidades e status ficam no menu suspenso do cabecalho,
 * exatamente como o Jogo Livre faz.
 */
export function RoundPanel({
  round,
  rounds,
  previousRound,
  reviewMode = false,
  busy,
  serverError,
  onStartRound,
  onSubmitAttempt,
}: RoundPanelProps) {
  const started = round.status === "IN_PROGRESS" || reviewMode;

  const input = useRoundInput({
    roundId: round.id,
    enabled: started && !busy && !reviewMode,
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

  // Em revisao o tabuleiro fica congelado: sem linha de digitacao.
  const gameStatus: GameStatus = reviewMode
    ? round.allWordsSolved
      ? "won"
      : "lost"
    : started
      ? "playing"
      : "won";
  const message = input.message.length > 0 ? input.message : (serverError ?? "");

  if (!started) {
    return (
      <section className="championship-panel" aria-labelledby="round-start-title">
        <header className="panel-header">
          <h1 id="round-start-title">
            Modalidade {round.roundOrder} de {rounds.length}
          </h1>
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
              {previousRound.bonusScore > 0
                ? ` (inclui ${previousRound.bonusScore} de bonus)`
                : ""}
            </p>
            {previousRound.boards.some((board) => board.answer !== null) ? (
              <p className="transition-answers">
                Respostas:{" "}
                {previousRound.boards
                  .map((board) => (board.answer === null ? "?" : repairMojibake(board.answer)))
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
        {serverError !== null ? (
          <p className="panel-error" role="alert">
            {serverError}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <h1 className="visually-hidden">{CHAMPIONSHIP_MODE_LABEL[round.mode]}</h1>

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
        invalidGuessId={input.invalidGuessId}
        revealingBoards={revealingBoards}
        onTileSelect={input.selectTile}
      />

      <Keyboard
        keyStatuses={keyboardStatuses}
        disabled={busy || reviewMode || input.isRevealing}
        onKey={input.handleKey}
      />
    </>
  );
}
