import { CHAMPIONSHIP_MODE_LABEL } from "../../config";
import type { AdminRoundOverview, ChampionshipStatus } from "../../types";

type AdminRoundsPanelProps = {
  rounds: AdminRoundOverview[];
  championshipStatus: ChampionshipStatus;
};

/**
 * Acompanhamento das quatro modalidades.
 * Nunca exibe respostas: elas vêm de uma RPC separada, só após o encerramento.
 */
export function AdminRoundsPanel({ rounds, championshipStatus }: AdminRoundsPanelProps) {
  const showProgress =
    championshipStatus === "IN_PROGRESS" ||
    championshipStatus === "CALCULATING_RESULTS" ||
    championshipStatus === "FINISHED";

  return (
    <section className="admin-section" aria-labelledby="admin-rounds-title">
      <h2 id="admin-rounds-title">Rodadas</h2>

      <ol className="admin-rounds-list">
        {rounds.map((round) => (
          <li key={round.id} className="admin-round-card">
            <header>
              <span className="admin-round-order">{round.roundOrder}</span>
              <strong>{CHAMPIONSHIP_MODE_LABEL[round.mode]}</strong>
            </header>

            <p className="admin-round-setup">
              {round.boardCount} palavra{round.boardCount === 1 ? "" : "s"} ·{" "}
              {round.maxAttempts} tentativas
            </p>

            {showProgress ? (
              <dl className="admin-round-progress">
                <div>
                  <dt>Não começaram</dt>
                  <dd>{round.notStarted}</dd>
                </div>
                <div>
                  <dt>Nesta rodada</dt>
                  <dd>{round.inProgress}</dd>
                </div>
                <div>
                  <dt>Concluíram</dt>
                  <dd>{round.completed}</dd>
                </div>
              </dl>
            ) : (
              <p className="admin-round-answers">
                {round.answerCount}/{round.boardCount} palavras sorteadas no servidor
              </p>
            )}
          </li>
        ))}
      </ol>

      {championshipStatus !== "FINISHED" ? (
        <p className="admin-section-hint">
          As respostas ficam protegidas no servidor e só podem ser consultadas depois do
          encerramento.
        </p>
      ) : null}
    </section>
  );
}
