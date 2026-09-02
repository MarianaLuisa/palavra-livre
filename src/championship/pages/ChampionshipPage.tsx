import type { ReactNode } from "react";
import { useAuth } from "../../account/AuthProvider";
import { SiteHeader } from "../../components/SiteHeader";
import { Link } from "../../router/router";
import type { ThemeMode } from "../../types/game";
import { AdminQuickCreate } from "../components/AdminQuickCreate";
import { ChampionshipErrorBoundary } from "../components/ChampionshipErrorBoundary";
import { RoundCompletionModal } from "../components/RoundCompletionModal";
import { RoundProgress } from "../components/RoundProgress";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_MODE_LABEL, CHAMPIONSHIP_ROUTES } from "../config";
import { getRoundId } from "../types";
import { JoinPanel } from "../panels/JoinPanel";
import { LobbyPanel } from "../panels/LobbyPanel";
import { ResultsPanel } from "../panels/ResultsPanel";
import { RoundPanel } from "../panels/RoundPanel";
import { useChampionship } from "../useChampionship";
import { useRoundCelebration } from "../useRoundCelebration";
import { getBrazilCurrentDate } from "../timezone";

type ChampionshipPageProps = {
  theme: ThemeMode;
  onToggleTheme: () => void;
};

export function ChampionshipPage({ theme, onToggleTheme }: ChampionshipPageProps) {
  const championship = useChampionship();
  const auth = useAuth();
  const celebration = useRoundCelebration(championship.state);

  const state = championship.state;
  const championshipSummary = state?.championship ?? null;
  const rounds = Array.isArray(state?.rounds) ? state.rounds : [];
  const participant = state?.participant ?? null;
  const activeRound = celebration.round ?? championship.currentRound;

  function renderHeaderControls() {
    if (!activeRound) {
      return null;
    }

    const attemptsUsed = activeRound.attemptsUsed ?? 0;
    const maxAttempts =
      activeRound.maxAttempts ??
      (activeRound.mode === "SIMPLE"
        ? 6
        : activeRound.mode === "DUET"
          ? 7
          : activeRound.mode === "QUARTET"
            ? 9
            : 11);
    const wordsSolved = activeRound.wordsSolved ?? 0;
    const boardCount =
      activeRound.boardCount ??
      (activeRound.mode === "SIMPLE"
        ? 1
        : activeRound.mode === "DUET"
          ? 2
          : activeRound.mode === "QUARTET"
            ? 4
            : 6);
    const remainingAttempts = Math.max(0, maxAttempts - attemptsUsed);

    return (
      <div className="site-control-content championship-header-controls">
        <RoundProgress rounds={rounds} currentRoundId={getRoundId(activeRound)} />
        <section className="status-panel" aria-label="Situação da modalidade">
          <div>
            <span>Modalidade</span>
            <strong>{CHAMPIONSHIP_MODE_LABEL[activeRound.mode] ?? activeRound.mode}</strong>
          </div>
          <div>
            <span>Tentativas</span>
            <strong>
              {attemptsUsed}/{maxAttempts}
            </strong>
          </div>
          <div>
            <span>Restantes</span>
            <strong>{remainingAttempts}</strong>
          </div>
          <div>
            <span>Resolvidas</span>
            <strong>
              {wordsSolved}/{boardCount}
            </strong>
          </div>
        </section>
      </div>
    );
  }

  function shell(content: ReactNode, playing = false, overlay: ReactNode = null) {
    const activeModeLabel = !activeRound
      ? null
      : (CHAMPIONSHIP_MODE_LABEL[activeRound.mode] ?? activeRound.mode);
    const boardCount = !activeRound
      ? 1
      : activeRound.boardCount ??
        (activeRound.mode === "SIMPLE"
          ? 1
          : activeRound.mode === "DUET"
            ? 2
            : activeRound.mode === "QUARTET"
              ? 4
              : 6);
    const attemptsUsed = activeRound ? activeRound.attemptsUsed ?? 0 : 0;
    const maxAttempts = activeRound ? activeRound.maxAttempts ?? 6 : 6;
    const wordsSolved = activeRound ? activeRound.wordsSolved ?? 0 : 0;

    // While playing, use the exact same responsive game shell as Jogo Livre.
    // Championship-only selectors had drifted and were shrinking the keyboard.
    const shellClassName = playing
      ? `free-play-game-shell boards-${boardCount}`
      : !activeRound
        ? "championship-page-shell"
        : `championship-page-shell boards-${boardCount}`;

    return (
      <div className={shellClassName}>
        <SiteHeader
          theme={theme}
          onToggleTheme={onToggleTheme}
          controlLabel="Modalidade"
          controlSummary={
            !activeRound || activeModeLabel === null
              ? undefined
              : `${activeModeLabel} · ${attemptsUsed}/${maxAttempts} · ${wordsSolved}/${boardCount}`
          }
          controlContent={renderHeaderControls()}
        />
        <main className={playing ? "game-layout" : "championship-layout"}>
          <ChampionshipErrorBoundary onReset={() => void championship.refresh()}>
            {content}
          </ChampionshipErrorBoundary>
        </main>
        {overlay}
      </div>
    );
  }

  if (!championship.configured) {
    return shell(
      <section className="championship-panel">
        <header className="panel-header">
          <h1>{CHAMPIONSHIP_BRAND.name}</h1>
        </header>
        <p className="panel-notice">
          Esta instalação ainda não está conectada ao servidor do{" "}
          {CHAMPIONSHIP_BRAND.eventLabel}. Configure <code>VITE_SUPABASE_URL</code> e{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> para habilitar a modalidade competitiva.
        </p>
        <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
          Jogar o Jogo Livre
        </Link>
      </section>,
    );
  }

  if (championship.loading && state === null) {
    return shell(
      <section className="championship-panel">
        <p className="loading-state">Carregando o {CHAMPIONSHIP_BRAND.eventLabel}...</p>
      </section>,
    );
  }

  if (state === null || championshipSummary === null) {
    return shell(
      <section className="championship-panel">
        <header className="panel-header">
          <h1>{CHAMPIONSHIP_BRAND.name}</h1>
        </header>
        <p className="panel-notice">
          Nenhum {CHAMPIONSHIP_BRAND.eventLabel} disponível no momento. Volte mais tarde ou
          aproveite o Jogo Livre, que não tem limite de partidas.
        </p>
        {championship.error !== null ? (
          <p className="panel-error" role="alert">
            {championship.error}
          </p>
        ) : null}
        <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
          Jogar o Jogo Livre
        </Link>
        <AdminQuickCreate onCreated={() => void championship.refresh()} />
      </section>,
    );
  }

  if (championshipSummary.status === "FINISHED") {
    return shell(
      <>
        <ResultsPanel
          championshipId={championshipSummary.id}
          currentUserParticipantId={participant?.id ?? null}
        />
        <AdminQuickCreate
          onCreated={() => void championship.refresh()}
          hint="Este campeonato já foi encerrado. Crie o do próximo dia quando quiser."
        />
      </>,
    );
  }

  if (championshipSummary.status === "CANCELLED") {
    return shell(
      <section className="championship-panel">
        <header className="panel-header">
          <h1>{CHAMPIONSHIP_BRAND.name}</h1>
        </header>
        <p className="panel-notice">O {CHAMPIONSHIP_BRAND.eventLabel} de hoje foi cancelado.</p>
        <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
          Jogar o Jogo Livre
        </Link>
        <AdminQuickCreate
          onCreated={() => void championship.refresh()}
          hint="O campeonato cancelado libera a data: dá para criar outro para hoje."
        />
      </section>,
    );
  }

  if (participant === null || participant.status === "CANCELLED") {
    return shell(
      <>
        <JoinPanel
          championship={championshipSummary}
          suggestedName={state.profile?.displayName ?? ""}
          accountUsername={auth.isAuthenticated ? (auth.profile?.username ?? null) : null}
          serverNow={state.now}
          busy={championship.busy}
          onRegister={(displayName) => void championship.register(displayName)}
        />
        {championship.error !== null ? (
          <p className="panel-error" role="alert">
            {championship.error}
          </p>
        ) : null}
      </>,
    );
  }

  if (
    championshipSummary.status !== "IN_PROGRESS" &&
    championshipSummary.status !== "CALCULATING_RESULTS"
  ) {
    return shell(
      <>
        <LobbyPanel
          championship={championshipSummary}
          participant={participant}
          serverNow={state.now}
          busy={championship.busy}
          onCancelRegistration={() => void championship.cancelRegistration()}
          onRefresh={() => void championship.refresh()}
        />
        {championship.error !== null ? (
          <p className="panel-error" role="alert">
            {championship.error}
          </p>
        ) : null}
      </>,
    );
  }

  if (celebration.round !== null) {
    const finished = celebration.round;
    const safeRounds = Array.isArray(state?.rounds) ? state.rounds : [];
    const nextRound = safeRounds
      .filter((round) => round && round.roundOrder > finished.roundOrder)
      .sort((left, right) => left.roundOrder - right.roundOrder)[0];

    return shell(
      <RoundPanel
        round={finished}
        rounds={safeRounds}
        previousRound={null}
        reviewMode={true}
        busy={championship.busy}
        serverError={null}
        onStartRound={() => undefined}
        onSubmitAttempt={async () => false}
      />,
      true,
      celebration.visible ? (
        <RoundCompletionModal
          round={finished}
          nextRoundLabel={
            nextRound === undefined ? null : (CHAMPIONSHIP_MODE_LABEL[nextRound.mode] ?? null)
          }
          onClose={celebration.dismiss}
        />
      ) : null,
    );
  }

  const safeRounds = Array.isArray(state?.rounds) ? state.rounds : [];
  
  // Seleciona a rodada ativa ou a próxima pendente
  const currentRound =
    championship.currentRound ??
    safeRounds.find((r: any) => r?.status === "IN_PROGRESS") ??
    safeRounds.find(
      (r: any) =>
        r?.status !== "COMPLETED" &&
        r?.status !== "FAILED" &&
        r?.status !== "EXPIRED",
    ) ??
    safeRounds[0] ??
    null;

  // Participante só é considerado finalizado se tiver concluído as 4 rodadas E nenhuma estiver ativa
  const isParticipantFinished =
    participant.status === "FINISHED" ||
    ((participant.completedRounds ?? 0) >= 4 && (!currentRound || currentRound.status === "COMPLETED"));

  if (isParticipantFinished) {
    const totalScore = safeRounds.reduce((total, round) => total + (round?.totalScore ?? 0), 0);
    const wordsSolved = safeRounds.reduce((total, round) => total + (round?.wordsSolved ?? 0), 0);

    return shell(
      <div className="progress-layout">
        <header className="progress-hero">
          <div>
            <p className="eyebrow">Campeonato Norte</p>
            <h1 id="waiting-results-title">Rodada diária concluída!</h1>
            <p className="panel-subtitle">
              Seu desempenho do dia foi registrado e sua pontuação já foi somada à classificação semanal.
            </p>
          </div>
        </header>

        <section className="account-section" aria-labelledby="round-perf-title">
          <h2 id="round-perf-title">Desempenho da Rodada de Hoje</h2>
          <dl className="round-summary-stats">
            <div>
              <dt>Pontuação da rodada</dt>
              <dd className="stat-highlight">
                {totalScore} pts
              </dd>
            </div>
            <div>
              <dt>Palavras resolvidas</dt>
              <dd>{wordsSolved}/13</dd>
            </div>
            <div>
              <dt>Modalidades</dt>
              <dd>{participant.completedRounds ?? 4}/4 concluídas</dd>
            </div>
            <div>
              <dt>Tentativas totais</dt>
              <dd>{participant.totalAttempts ?? safeRounds.reduce((acc, r) => acc + (r?.attemptsUsed ?? 0), 0)}</dd>
            </div>
          </dl>

          <h3 style={{ marginTop: "1.5rem", marginBottom: "0.85rem" }}>Por modalidade</h3>
          <ul className="championship-mode-grid">
            {safeRounds.map((round, index) => (
              <li key={round?.id ?? `mode-${index}`} className="championship-mode-card">
                <header>
                  <strong className="mode-name">{CHAMPIONSHIP_MODE_LABEL[round.mode] ?? round.mode}</strong>
                  <span className="mode-score">{round.totalScore ?? 0} pts</span>
                </header>
                <dl className="mode-metrics-grid">
                  <div>
                    <dt>Palavras</dt>
                    <dd>{round.wordsSolved ?? 0}/{round.boardCount ?? 1}</dd>
                  </div>
                  <div>
                    <dt>Tentativas</dt>
                    <dd>{round.attemptsUsed ?? 0}/{round.maxAttempts ?? 6}</dd>
                  </div>
                  <div>
                    <dt>Bônus</dt>
                    <dd>{round.bonusScore && round.bonusScore > 0 ? `+${round.bonusScore}` : "0"}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>

        <div className="panel-actions wrap" style={{ marginTop: "0.5rem" }}>
          <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.leaderboard}>
            Ver Classificação Semanal
          </Link>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void championship.refresh()}
            disabled={championship.busy}
          >
            Atualizar
          </button>
          <Link className="ghost-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
            Jogar Jogo Livre
          </Link>
        </div>
      </div>,
    );
  }

  if (currentRound === null) {
    return shell(
      <section className="championship-panel">
        <p className="loading-state">Carregando modalidade do campeonato...</p>
      </section>,
    );
  }

  const previousRound =
    safeRounds
      .filter((round) => round && round.roundOrder < currentRound.roundOrder)
      .sort((left, right) => right.roundOrder - left.roundOrder)[0] ?? null;

  return shell(
    <RoundPanel
      round={currentRound}
      rounds={safeRounds}
      previousRound={currentRound.status === "NOT_STARTED" ? previousRound : null}
      busy={championship.busy}
      serverError={championship.error}
      onStartRound={async (roundId) => {
        const idToStart = roundId || getRoundId(currentRound);
        await championship.startRound(idToStart);
      }}
      onSubmitAttempt={championship.submitAttempt}
    />,
    currentRound.status === "IN_PROGRESS",
  );
}
