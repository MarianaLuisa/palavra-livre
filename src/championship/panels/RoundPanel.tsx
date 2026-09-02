import { useEffect, useMemo } from "react";
import { Keyboard } from "../../components/Keyboard";
import type { GameStatus } from "../../types/game";
import { getKeyboardStatus } from "../../utils/keyboardStatus";
import { repairMojibake } from "../../utils/repairMojibake";
import { ChampionshipBoardGrid, toBoardState } from "../components/ChampionshipBoardGrid";
import { RoundProgress } from "../components/RoundProgress";
import { CHAMPIONSHIP_MODE_LABEL } from "../config";
import { getRoundId, type ChampionshipRoundState } from "../types";
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
  const safeRound = round ?? {
    id: "",
    roundOrder: 1,
    mode: "SIMPLE",
    status: "NOT_STARTED",
    boardCount: 1,
    maxAttempts: 6,
    attemptsUsed: 0,
    wordsSolved: 0,
    allWordsSolved: false,
    bonusScore: 0,
    totalScore: 0,
    durationMs: 0,
    boards: [],
  };

  const roundId = getRoundId(safeRound);
  const safeRounds = Array.isArray(rounds) ? rounds : [safeRound];
  const safeBoards =
    Array.isArray(safeRound.boards) && safeRound.boards.length > 0
      ? safeRound.boards
      : Array.from({ length: safeRound.boardCount ?? 1 }, (_, index) => ({
          boardIndex: index,
          solved: false,
          answer: null,
          rows: [],
        }));

  const started = safeRound.status === "IN_PROGRESS" || reviewMode;

  const input = useRoundInput({
    roundId,
    enabled: started && !busy && !reviewMode,
    onSubmit: (word) => onSubmitAttempt(roundId, word),
  });

  const revealingBoards = useRevealingBoards(safeBoards, roundId);

  // O teclado so incorpora a linha nova depois da animacao terminar,
  // igual ao Jogo Livre.
  const keyboardStatuses = useMemo(() => {
    const boardsForKeyboard = safeBoards.map((board) => {
      const boardState = toBoardState(board);

      if (!input.isRevealing || !revealingBoards.includes(board.boardIndex)) {
        return boardState;
      }

      return { ...boardState, rows: boardState.rows.slice(0, -1) };
    });

    return getKeyboardStatus(boardsForKeyboard);
  }, [input.isRevealing, revealingBoards, safeBoards]);

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
    ? safeRound.allWordsSolved
      ? "won"
      : "lost"
    : started
      ? "playing"
      : "won";
  const message = input.message.length > 0 ? input.message : (serverError ?? "");

  if (!started) {
    const previousBoards = Array.isArray(previousRound?.boards) ? previousRound.boards : [];

    return (
      <section className="championship-panel" aria-labelledby="round-start-title">
        <header className="panel-header">
          <h1 id="round-start-title">
            Modalidade {safeRound.roundOrder} de {safeRounds.length}
          </h1>
          <p className="panel-subtitle">{CHAMPIONSHIP_MODE_LABEL[safeRound.mode] ?? safeRound.mode}</p>
        </header>

        <RoundProgress rounds={safeRounds} currentRoundId={safeRound.id} />

        {previousRound !== null ? (
          <div className="transition-summary" aria-label="Resultado da modalidade anterior">
            <h2>{CHAMPIONSHIP_MODE_LABEL[previousRound.mode] ?? previousRound.mode} concluido</h2>
            <p>
              {previousRound.wordsSolved ?? 0}/{previousRound.boardCount ?? 1} palavras ·{" "}
              {previousRound.attemptsUsed ?? 0}/{previousRound.maxAttempts ?? 6} tentativas ·{" "}
              {previousRound.totalScore ?? 0} pontos
              {previousRound.bonusScore && previousRound.bonusScore > 0
                ? ` (inclui ${previousRound.bonusScore} de bonus)`
                : ""}
            </p>
            {previousBoards.some((board) => board?.answer !== null) ? (
              <p className="transition-answers">
                Respostas:{" "}
                {previousBoards
                  .map((board) => (board?.answer === null ? "?" : repairMojibake(board?.answer ?? "")))
                  .join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}

        <dl className="panel-grid">
          <div>
            <dt>Palavras</dt>
            <dd>{safeRound.boardCount ?? 1}</dd>
          </div>
          <div>
            <dt>Tentativas</dt>
            <dd>{safeRound.maxAttempts ?? 6}</dd>
          </div>
          <div>
            <dt>Pontos possiveis</dt>
            <dd>{(safeRound.boardCount ?? 1) * 100} + bonus</dd>
          </div>
        </dl>

        <p className="panel-notice">
          O cronometro desta modalidade comeca quando voce clicar em iniciar.
        </p>

        <button
          className="primary-button"
          type="button"
          onClick={() => onStartRound(roundId)}
          disabled={busy}
        >
          {busy ? "Abrindo..." : `Iniciar ${CHAMPIONSHIP_MODE_LABEL[safeRound.mode] ?? safeRound.mode}`}
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
      <h1 className="visually-hidden">{CHAMPIONSHIP_MODE_LABEL[safeRound.mode] ?? safeRound.mode}</h1>

      <div
        className={message.length > 0 ? "message visible" : "message"}
        key={`${input.messageId}-${serverError ?? ""}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>

      <ChampionshipBoardGrid
        boards={safeBoards}
        currentGuessLetters={input.letters}
        activeTileIndex={input.activeTileIndex}
        maxAttempts={safeRound.maxAttempts ?? 6}
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
