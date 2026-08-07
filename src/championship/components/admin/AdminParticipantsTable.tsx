import { CHAMPIONSHIP_MODE_LABEL } from "../../config";
import { formatDuration, formatPosition, formatScore } from "../../format";
import type { AdminParticipant } from "../../types";

type AdminParticipantsTableProps = {
  participants: AdminParticipant[];
  showRanking: boolean;
};

/**
 * Situação amigável de cada participante.
 * "Jogando Quarteto" é mais útil para acompanhar do que "IN_PROGRESS".
 */
export function describeParticipant(participant: AdminParticipant): string {
  switch (participant.status) {
    case "REGISTERED":
      return participant.startedAt === null ? "Aguardando" : "Inscrito";
    case "IN_PROGRESS":
      return participant.currentRoundMode === null
        ? "Jogando"
        : `Jogando ${CHAMPIONSHIP_MODE_LABEL[participant.currentRoundMode]}`;
    case "FINISHED":
      return "Finalizado";
    case "ABANDONED":
      return "Abandonou";
    case "CANCELLED":
      return "Inscrição cancelada";
    default:
      return participant.status;
  }
}

export function AdminParticipantsTable({
  participants,
  showRanking,
}: AdminParticipantsTableProps) {
  if (participants.length === 0) {
    return (
      <section className="admin-section" aria-labelledby="admin-participants-title">
        <h2 id="admin-participants-title">Participantes</h2>
        <p className="empty-state">Ninguém inscrito ainda.</p>
      </section>
    );
  }

  return (
    <section className="admin-section" aria-labelledby="admin-participants-title">
      <h2 id="admin-participants-title">Participantes ({participants.length})</h2>

      <div className="table-scroll">
        <table className="breakdown-table admin-participants-table">
          <thead>
            <tr>
              {showRanking ? <th scope="col">#</th> : null}
              <th scope="col">Nome</th>
              <th scope="col">Situação</th>
              <th scope="col">Palavras</th>
              <th scope="col">Pontos</th>
              <th scope="col">Tentativas</th>
              <th scope="col">Tempo</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((participant) => (
              <tr
                key={participant.id}
                className={participant.finalPosition === 1 ? "leaderboard-row first" : undefined}
              >
                {showRanking ? <td>{formatPosition(participant.finalPosition)}</td> : null}
                <td>{participant.displayName}</td>
                <td>{describeParticipant(participant)}</td>
                <td>{participant.wordsSolved}/13</td>
                <td>{formatScore(participant.totalScore)}</td>
                <td>{participant.totalAttempts}</td>
                <td>{formatDuration(participant.totalDurationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
