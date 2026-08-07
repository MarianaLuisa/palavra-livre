import type { ReactNode } from "react";
import { useAuth } from "../../account/AuthProvider";
import { SiteHeader } from "../../components/SiteHeader";
import { Link } from "../../router/router";
import type { ThemeMode } from "../../types/game";
import { AdminQuickCreate } from "../components/AdminQuickCreate";
import { RoundCompletionModal } from "../components/RoundCompletionModal";
import { RoundProgress } from "../components/RoundProgress";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_MODE_LABEL, CHAMPIONSHIP_ROUTES } from "../config";
import { JoinPanel } from "../panels/JoinPanel";
import { LobbyPanel } from "../panels/LobbyPanel";
import { ResultsPanel } from "../panels/ResultsPanel";
import { RoundPanel } from "../panels/RoundPanel";
import { useChampionship } from "../useChampionship";
import { useRoundCelebration } from "../useRoundCelebration";

/**
 * Orquestra a experiência do campeonato.
 *
 * O cabeçalho principal vem sempre do SiteHeader global. Os controles
 * específicos da rodada ficam abaixo dele para não duplicar menus.
 *
 * A tela exibida deriva SEMPRE do estado devolvido pelo servidor.
 */
type ChampionshipPageProps = {
  theme: ThemeMode;
  onToggleTheme: () => void;
};

export function ChampionshipPage({ theme, onToggleTheme }: ChampionshipPageProps) {
  const championship = useChampionship();
  const auth = useAuth();
  const celebration = useRoundCelebration(championship.state);

  const state = championship.state;
  const rounds = state?.rounds ?? [];
  const activeRound = celebration.round ?? championship.currentRound;

  function renderHeaderControls() {
    if (activeRound === null) {
      return null;
    }

    return (
      <div className="site-control-content championship-header-controls">
        <RoundProgress rounds={rounds} currentRoundId={activeRound.id} />
        <section className="status-panel" aria-label="Situação da modalidade">
          <div>
            <span>Modalidade</span>
            <strong>{CHAMPIONSHIP_MODE_LABEL[activeRound.mode]}</strong>
          </div>
          <div>
            <span>Tentativas</span>
            <strong>
              {activeRound.attemptsUsed}/{activeRound.maxAttempts}
            </strong>
          </div>
          <div>
            <span>Restantes</span>
            <strong>
              {Math.max(activeRound.maxAttempts - activeRound.attemptsUsed, 0)}
            </strong>
          </div>
          <div>
            <span>Resolvidas</span>
            <strong>
              {activeRound.wordsSolved}/{activeRound.boardCount}
            </strong>
          </div>
        </section>
      </div>
    );
  }

  function shell(content: ReactNode, playing = false) {
    const activeModeLabel =
      activeRound === null ? null : CHAMPIONSHIP_MODE_LABEL[activeRound.mode];
    const shellClassName =
      activeRound === null
        ? "championship-page-shell"
        : `championship-page-shell boards-${activeRound.boardCount}`;

    return (
      <div className={shellClassName}>
        <SiteHeader
          theme={theme}
          onToggleTheme={onToggleTheme}
          controlLabel="Modalidade"
          controlSummary={
            activeRound === null || activeModeLabel === null
              ? undefined
              : `${activeModeLabel} · ${activeRound.attemptsUsed}/${activeRound.maxAttempts} · ${activeRound.wordsSolved}/${activeRound.boardCount}`
          }
          controlContent={renderHeaderControls()}
        />
        <main className={playing ? "game-layout" : "championship-layout"}>{content}</main>
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

  if (championship.loading) {
    return shell(
      <section className="championship-panel">
        <p className="loading-state">Carregando o {CHAMPIONSHIP_BRAND.eventLabel}...</p>
      </section>,
    );
  }

  const championshipSummary = state?.championship ?? null;

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

  const participant = state.participant;

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
    const nextRound = state.rounds
      .filter((round) => round.roundOrder > finished.roundOrder)
      .sort((left, right) => left.roundOrder - right.roundOrder)[0];

    return shell(
      <>
        <RoundPanel
          round={finished}
          rounds={state.rounds}
          previousRound={null}
          reviewMode
          busy={championship.busy}
          serverError={null}
          onStartRound={() => undefined}
          onSubmitAttempt={async () => false}
        />
        {celebration.visible ? (
          <RoundCompletionModal
            round={finished}
            nextRoundLabel={
              nextRound === undefined
                ? null
                : (CHAMPIONSHIP_MODE_LABEL[nextRound.mode] ?? null)
            }
            onClose={celebration.dismiss}
          />
        ) : null}
      </>,
      true,
    );
  }

  const currentRound = championship.currentRound;

  if (currentRound === null) {
    const totalScore = state.rounds.reduce((total, round) => total + round.totalScore, 0);
    const wordsSolved = state.rounds.reduce((total, round) => total + round.wordsSolved, 0);

    return shell(
      <section className="championship-panel" aria-labelledby="waiting-results-title">
        <header className="panel-header">
          <h1 id="waiting-results-title">Você concluiu o {CHAMPIONSHIP_BRAND.eventLabel}</h1>
          <p className="panel-subtitle">
            A classificação oficial é publicada quando o {CHAMPIONSHIP_BRAND.eventLabel} encerrar.
          </p>
        </header>

        <dl className="panel-grid">
          <div>
            <dt>Sua pontuação parcial</dt>
            <dd>{totalScore}</dd>
          </div>
          <div>
            <dt>Palavras descobertas</dt>
            <dd>{wordsSolved}/13</dd>
          </div>
          <div>
            <dt>Modalidades concluídas</dt>
            <dd>{participant.completedRounds}/4</dd>
          </div>
        </dl>

        <p className="panel-notice">
          Nada de resultados detalhados enquanto outras pessoas ainda jogam: todos disputam nas
          mesmas condições.
        </p>

        <div className="panel-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void championship.refresh()}
            disabled={championship.busy}
          >
            Verificar encerramento
          </button>
          <Link className="ghost-button" to={CHAMPIONSHIP_ROUTES.leaderboard}>
            Ver participantes
          </Link>
        </div>
      </section>,
    );
  }

  const previousRound =
    state.rounds
      .filter((round) => round.roundOrder < currentRound.roundOrder)
      .sort((left, right) => right.roundOrder - left.roundOrder)[0] ?? null;

  return shell(
    <RoundPanel
      round={currentRound}
      rounds={state.rounds}
      previousRound={currentRound.status === "NOT_STARTED" ? previousRound : null}
      busy={championship.busy}
      serverError={championship.error}
      onStartRound={(roundId) => void championship.startRound(roundId)}
      onSubmitAttempt={championship.submitAttempt}
    />,
    currentRound.status === "IN_PROGRESS",
  );
}

