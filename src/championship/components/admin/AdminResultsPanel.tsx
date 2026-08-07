import { Podium } from "../Podium";
import { CHAMPIONSHIP_MODE_LABEL, CHAMPIONSHIP_TOTAL_WORDS } from "../../config";
import { formatDateTime, formatDuration, formatScore } from "../../format";
import type { AdminParticipant, AdminRoundAnswers } from "../../types";
import { repairMojibakeList } from "../../../utils/repairMojibake";

type AdminResultsPanelProps = {
  participants: AdminParticipant[];
  finishedAt: string | null;
  answers: AdminRoundAnswers[] | null;
  loadingAnswers: boolean;
  onLoadAnswers: () => void;
};

/** Resumo do campeonato encerrado, com as respostas sob demanda. */
export function AdminResultsPanel({
  participants,
  finishedAt,
  answers,
  loadingAnswers,
  onLoadAnswers,
}: AdminResultsPanelProps) {
  const ranked = participants
    .filter((participant) => participant.finalPosition !== null)
    .sort((left, right) => (left.finalPosition ?? 0) - (right.finalPosition ?? 0));
  const champion = ranked[0];
  const bestScore = participants.reduce(
    (best, participant) => Math.max(best, participant.totalScore),
    0,
  );

  return (
    <section className="admin-section" aria-labelledby="admin-results-title">
      <h2 id="admin-results-title">Resultado final</h2>

      {champion === undefined ? (
        <p className="empty-state">Nenhum participante classificado.</p>
      ) : (
        <>
          <p className="champion-highlight">
            Campeão do dia: <strong>{champion.displayName}</strong> com{" "}
            {formatScore(champion.totalScore)} pontos e {champion.wordsSolved}/
            {CHAMPIONSHIP_TOTAL_WORDS} palavras.
          </p>

          <Podium
            places={ranked
              .filter((participant) => (participant.finalPosition ?? 0) <= 3)
              .map((participant) => ({
                position: participant.finalPosition ?? 0,
                displayName: participant.displayName,
                totalScore: participant.totalScore,
                wordsSolved: participant.wordsSolved,
              }))}
          />

          <dl className="panel-grid">
            <div>
              <dt>Participantes</dt>
              <dd>{participants.length}</dd>
            </div>
            <div>
              <dt>Maior pontuação</dt>
              <dd>{formatScore(bestScore)}</dd>
            </div>
            <div>
              <dt>Tentativas do campeão</dt>
              <dd>{champion.totalAttempts}</dd>
            </div>
            <div>
              <dt>Tempo do campeão</dt>
              <dd>{formatDuration(champion.totalDurationMs)}</dd>
            </div>
            <div>
              <dt>Encerrado em</dt>
              <dd>{formatDateTime(finishedAt)}</dd>
            </div>
          </dl>
        </>
      )}

      <div className="admin-answers-block">
        <h3>Palavras do campeonato</h3>
        {answers === null ? (
          <>
            <p className="admin-section-hint">
              As respostas ficam no servidor. Carregue sob demanda por RPC administrativa.
            </p>
            <button
              className="secondary-button"
              type="button"
              onClick={onLoadAnswers}
              disabled={loadingAnswers}
            >
              {loadingAnswers ? "Carregando..." : "Ver as palavras"}
            </button>
          </>
        ) : (
          <ul className="answers-list">
            {answers.map((round) => (
              <li key={round.roundId}>
                <strong>{CHAMPIONSHIP_MODE_LABEL[round.mode]}:</strong>{" "}
                {repairMojibakeList(round.answers).join(", ")}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
