import { useEffect, useState } from "react";
import { LeaderboardTable, sortLeaderboardEntries } from "../components/LeaderboardTable";
import { Podium } from "../components/Podium";
import {
  CHAMPIONSHIP_BRAND,
  CHAMPIONSHIP_MODE_LABEL,
  CHAMPIONSHIP_TOTAL_WORDS,
  PARTICIPANT_ROUND_STATUS_LABEL,
} from "../config";
import { getErrorMessage } from "../errors";
import { formatDate, formatDuration, formatPosition, formatScore } from "../format";
import { getChampionshipService } from "../service";
import { createChampionshipShareText, shareChampionshipResult } from "../share";
import type { ChampionshipResults } from "../types";
import { repairMojibakeList } from "../../utils/repairMojibake";

type ResultsPanelProps = {
  championshipId: string;
  currentUserParticipantId: string | null;
};

export function ResultsPanel({ championshipId, currentUserParticipantId }: ResultsPanelProps) {
  const [results, setResults] = useState<ChampionshipResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getChampionshipService()
      .getResults(championshipId)
      .then((data) => {
        if (active) {
          setResults(data);
          setError(null);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setError(getErrorMessage(caughtError));
        }
      });

    return () => {
      active = false;
    };
  }, [championshipId]);

  if (error !== null) {
    return (
      <section className="championship-panel">
        <p className="panel-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (results === null) {
    return (
      <section className="championship-panel">
        <p className="loading-state">Carregando o resultado do {CHAMPIONSHIP_BRAND.eventLabel}...</p>
      </section>
    );
  }

  const me = results.participants.find(
    (participant) => participant.participantId === currentUserParticipantId,
  );
  const champion = results.participants.find((participant) => participant.position === 1);
  const sortedParticipants = sortLeaderboardEntries(results.participants);

  async function handleShare() {
    if (me === undefined) {
      return;
    }

    const text = createChampionshipShareText({
      championshipDate: results!.championship.championshipDate,
      championshipFinished: true,
      position: me.position,
      totalScore: me.totalScore ?? 0,
      wordsSolved: me.wordsSolved ?? 0,
    });

    const outcome = await shareChampionshipResult(text);
    setShareFeedback(
      outcome === "shared"
        ? "Resultado compartilhado."
        : outcome === "copied"
          ? "Resultado copiado para a área de transferência."
          : "Não foi possível compartilhar neste dispositivo.",
    );
  }

  return (
    <section className="championship-panel results-panel" aria-labelledby="results-title">
      <header className="panel-header">
        <h1 id="results-title">Resultado do {CHAMPIONSHIP_BRAND.eventLabel}</h1>
        <p className="panel-subtitle">
          {results.championship.name} · {formatDate(results.championship.championshipDate)}
        </p>
      </header>

      {champion !== undefined ? (
        <p className="champion-highlight">
          Campeão do dia: <strong>{champion.displayName}</strong> com{" "}
          {formatScore(champion.totalScore)} pontos.
        </p>
      ) : null}

      <Podium
        places={sortedParticipants
          .filter((participant) => participant.position !== null && participant.position <= 3)
          .map((participant) => ({
            position: participant.position ?? 0,
            displayName: participant.displayName,
            totalScore: participant.totalScore,
            wordsSolved: participant.wordsSolved,
          }))}
        highlightName={me?.displayName ?? null}
      />

      {me !== undefined ? (
        <section className="my-result" aria-labelledby="my-result-title">
          <h2 id="my-result-title">Seu desempenho</h2>
          <dl className="panel-grid">
            <div>
              <dt>Colocação</dt>
              <dd>{formatPosition(me.position)}</dd>
            </div>
            <div>
              <dt>Pontuação</dt>
              <dd>{formatScore(me.totalScore)}</dd>
            </div>
            <div>
              <dt>Palavras</dt>
              <dd>
                {me.wordsSolved ?? 0}/{CHAMPIONSHIP_TOTAL_WORDS}
              </dd>
            </div>
            <div>
              <dt>Modalidades concluídas</dt>
              <dd>{me.completedRounds}/4</dd>
            </div>
            <div>
              <dt>Tentativas</dt>
              <dd>{me.totalAttempts ?? 0}</dd>
            </div>
            <div>
              <dt>Tempo total</dt>
              <dd>{formatDuration(me.totalDurationMs)}</dd>
            </div>
          </dl>

          <div className="table-scroll">
            <table className="breakdown-table">
              <caption className="visually-hidden">Desempenho por modalidade</caption>
              <thead>
                <tr>
                  <th scope="col">Modalidade</th>
                  <th scope="col">Palavras</th>
                  <th scope="col">Tentativas</th>
                  <th scope="col">Base</th>
                  <th scope="col">Bônus</th>
                  <th scope="col">Total</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {me.rounds.map((round) => (
                  <tr key={round.roundOrder}>
                    <td>{CHAMPIONSHIP_MODE_LABEL[round.mode]}</td>
                    <td>
                      {round.wordsSolved}/{round.totalWords}
                    </td>
                    <td>
                      {round.attemptsUsed} (restaram {round.attemptsLeft})
                    </td>
                    <td>{round.baseScore}</td>
                    <td>{round.bonusScore}</td>
                    <td>{round.totalScore}</td>
                    <td>{PARTICIPANT_ROUND_STATUS_LABEL[round.status] ?? round.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel-actions">
            <button className="primary-button" type="button" onClick={() => void handleShare()}>
              Compartilhar resultado
            </button>
          </div>
          {shareFeedback !== null ? (
            <p className="panel-footnote" role="status">
              {shareFeedback}
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="answers-title">
        <h2 id="answers-title">Palavras do {CHAMPIONSHIP_BRAND.eventLabel}</h2>
        <ul className="answers-list">
          {results.rounds.map((round) => (
            <li key={round.roundId}>
              <strong>{CHAMPIONSHIP_MODE_LABEL[round.mode]}:</strong>{" "}
              {repairMojibakeList(round.answers).join(", ")}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="final-standings-title">
        <h2 id="final-standings-title">Classificação completa</h2>
        <LeaderboardTable
          entries={sortedParticipants}
          isFinal
          highlightParticipantId={currentUserParticipantId}
        />
      </section>
    </section>
  );
}
