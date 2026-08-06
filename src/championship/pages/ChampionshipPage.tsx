import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_ROUTES } from "../config";
import { JoinPanel } from "../panels/JoinPanel";
import { LobbyPanel } from "../panels/LobbyPanel";
import { ResultsPanel } from "../panels/ResultsPanel";
import { RoundPanel } from "../panels/RoundPanel";
import { Link } from "../../router/router";
import { useChampionship } from "../useChampionship";

/**
 * Orquestra a experiencia do campeonato.
 * A tela exibida deriva SEMPRE do estado devolvido pelo servidor.
 */
export function ChampionshipPage() {
  const championship = useChampionship();

  if (!championship.configured) {
    return (
      <section className="championship-panel">
        <header className="panel-header">
          <h1>{CHAMPIONSHIP_BRAND.name}</h1>
        </header>
        <p className="panel-notice">
          Esta instalacao ainda nao esta conectada ao servidor do{" "}
          {CHAMPIONSHIP_BRAND.eventLabel}. Configure <code>VITE_SUPABASE_URL</code> e{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> para habilitar a modalidade competitiva.
        </p>
        <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
          Jogar o Jogo Livre
        </Link>
      </section>
    );
  }

  if (championship.loading) {
    return (
      <section className="championship-panel">
        <p className="loading-state">Carregando o {CHAMPIONSHIP_BRAND.eventLabel}...</p>
      </section>
    );
  }

  const state = championship.state;
  const summary = state?.championship ?? null;

  if (state === null || summary === null) {
    return (
      <section className="championship-panel">
        <header className="panel-header">
          <h1>{CHAMPIONSHIP_BRAND.name}</h1>
        </header>
        <p className="panel-notice">
          Nenhum {CHAMPIONSHIP_BRAND.eventLabel} disponivel no momento. Volte mais tarde ou
          aproveite o Jogo Livre, que nao tem limite de partidas.
        </p>
        {championship.error !== null ? (
          <p className="panel-error" role="alert">
            {championship.error}
          </p>
        ) : null}
        <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
          Jogar o Jogo Livre
        </Link>
      </section>
    );
  }

  const participant = state.participant;

  // Campeonato encerrado: resultado final.
  if (summary.status === "FINISHED") {
    return (
      <ResultsPanel
        championshipId={summary.id}
        currentUserParticipantId={participant?.id ?? null}
      />
    );
  }

  if (summary.status === "CANCELLED") {
    return (
      <section className="championship-panel">
        <header className="panel-header">
          <h1>{CHAMPIONSHIP_BRAND.name}</h1>
        </header>
        <p className="panel-notice">O {CHAMPIONSHIP_BRAND.eventLabel} de hoje foi cancelado.</p>
        <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
          Jogar o Jogo Livre
        </Link>
      </section>
    );
  }

  // Sem inscricao: tela de entrada.
  if (participant === null || participant.status === "CANCELLED") {
    return (
      <>
        <JoinPanel
          championship={summary}
          suggestedName={state.profile?.displayName ?? ""}
          busy={championship.busy}
          onRegister={(displayName) => void championship.register(displayName)}
        />
        {championship.error !== null ? (
          <p className="panel-error" role="alert">
            {championship.error}
          </p>
        ) : null}
      </>
    );
  }

  // Inscrito, antes do inicio: sala de espera.
  if (summary.status !== "IN_PROGRESS" && summary.status !== "CALCULATING_RESULTS") {
    return (
      <>
        <LobbyPanel
          championship={summary}
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
      </>
    );
  }

  const currentRound = championship.currentRound;

  // Todas as modalidades concluidas, aguardando o encerramento oficial.
  if (currentRound === null) {
    const totalScore = state.rounds.reduce((total, round) => total + round.totalScore, 0);
    const wordsSolved = state.rounds.reduce((total, round) => total + round.wordsSolved, 0);

    return (
      <section className="championship-panel" aria-labelledby="waiting-results-title">
        <header className="panel-header">
          <h1 id="waiting-results-title">Voce concluiu o {CHAMPIONSHIP_BRAND.eventLabel}</h1>
          <p className="panel-subtitle">
            A classificacao oficial e publicada quando o {CHAMPIONSHIP_BRAND.eventLabel} encerrar.
          </p>
        </header>

        <dl className="panel-grid">
          <div>
            <dt>Sua pontuacao parcial</dt>
            <dd>{totalScore}</dd>
          </div>
          <div>
            <dt>Palavras descobertas</dt>
            <dd>{wordsSolved}/13</dd>
          </div>
          <div>
            <dt>Modalidades concluidas</dt>
            <dd>{participant.completedRounds}/4</dd>
          </div>
        </dl>

        <p className="panel-notice">
          Nada de resultados detalhados enquanto outras pessoas ainda jogam: todos disputam nas
          mesmas condicoes.
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
      </section>
    );
  }

  const previousRound =
    state.rounds
      .filter((round) => round.roundOrder < currentRound.roundOrder)
      .sort((left, right) => right.roundOrder - left.roundOrder)[0] ?? null;

  return (
    <RoundPanel
      round={currentRound}
      rounds={state.rounds}
      previousRound={currentRound.status === "NOT_STARTED" ? previousRound : null}
      busy={championship.busy}
      serverError={championship.error}
      onStartRound={(roundId) => void championship.startRound(roundId)}
      onSubmitAttempt={championship.submitAttempt}
    />
  );
}
