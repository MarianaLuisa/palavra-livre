import { useCallback, useEffect, useState } from "react";
import {
  CHAMPIONSHIP_BRAND,
  CHAMPIONSHIP_MODE_LABEL,
  CHAMPIONSHIP_STATUS_LABEL,
} from "../config";
import { getErrorMessage } from "../errors";
import { formatDate, formatDateTime } from "../format";
import { getChampionshipService } from "../service";
import type { AdminOverview, ChampionshipStatus } from "../types";

const MANUAL_STATUSES: ChampionshipStatus[] = [
  "REGISTRATION_OPEN",
  "WAITING",
  "IN_PROGRESS",
  "FINISHED",
  "CANCELLED",
];

/**
 * Painel administrativo minimo.
 * A protecao real esta no banco: todas as RPCs abaixo chamam
 * cd_require_admin(). Esta tela apenas evita cliques inuteis.
 */
export function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const service = getChampionshipService();

    if (!service.isConfigured()) {
      setError(getErrorMessage("NOT_CONFIGURED"));
      return;
    }

    try {
      setOverview(await service.getAdminOverview());
      setError(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<unknown>, successMessage: string) => {
      setBusy(true);
      setFeedback(null);
      try {
        await action();
        setFeedback(successMessage);
        await load();
        setError(null);
      } catch (caughtError) {
        setError(getErrorMessage(caughtError));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const service = getChampionshipService();
  const championship = overview?.championship ?? null;

  return (
    <section className="championship-panel" aria-labelledby="admin-title">
      <header className="panel-header">
        <h1 id="admin-title">Administracao</h1>
        <p className="panel-subtitle">{CHAMPIONSHIP_BRAND.name}</p>
      </header>

      {error !== null ? (
        <p className="panel-error" role="alert">
          {error}
        </p>
      ) : null}
      {feedback !== null ? (
        <p className="panel-footnote" role="status">
          {feedback}
        </p>
      ) : null}

      <div className="panel-actions">
        <button
          className="primary-button"
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() => service.createChampionship({}), "Campeonato criado e palavras sorteadas.")
          }
        >
          Criar campeonato de hoje
        </button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => void load()}>
          Atualizar
        </button>
      </div>

      {championship === null ? (
        <p className="empty-state">Nenhum campeonato encontrado.</p>
      ) : (
        <>
          <dl className="panel-grid">
            <div>
              <dt>Data</dt>
              <dd>{formatDate(championship.championship_date)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{CHAMPIONSHIP_STATUS_LABEL[championship.status] ?? championship.status}</dd>
            </div>
            <div>
              <dt>Inscricoes abrem</dt>
              <dd>{formatDateTime(championship.registration_opens_at)}</dd>
            </div>
            <div>
              <dt>Inscricoes fecham</dt>
              <dd>{formatDateTime(championship.registration_closes_at)}</dd>
            </div>
            <div>
              <dt>Inicio</dt>
              <dd>{formatDateTime(championship.starts_at)}</dd>
            </div>
            <div>
              <dt>Encerramento</dt>
              <dd>{formatDateTime(championship.finished_at)}</dd>
            </div>
          </dl>

          <section aria-labelledby="admin-status-title">
            <h2 id="admin-status-title">Transicoes manuais</h2>
            <div className="panel-actions wrap">
              {MANUAL_STATUSES.map((status) => (
                <button
                  key={status}
                  className="ghost-button"
                  type="button"
                  disabled={busy || championship.status === status}
                  onClick={() =>
                    void run(
                      () => service.setChampionshipStatus(championship.id, status),
                      `Status alterado para ${CHAMPIONSHIP_STATUS_LABEL[status] ?? status}.`,
                    )
                  }
                >
                  {CHAMPIONSHIP_STATUS_LABEL[status] ?? status}
                </button>
              ))}
            </div>
            <div className="panel-actions wrap">
              <button
                className="ghost-button"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => service.redrawWords(championship.id),
                    "Novas palavras sorteadas no servidor.",
                  )
                }
              >
                Sortear novas palavras
              </button>
              <button
                className="ghost-button"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => service.recalculateRanking(championship.id),
                    "Classificacao recalculada.",
                  )
                }
              >
                Recalcular classificacao
              </button>
            </div>
          </section>

          <section aria-labelledby="admin-rounds-title">
            <h2 id="admin-rounds-title">Modalidades</h2>
            <div className="table-scroll">
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th scope="col">Ordem</th>
                    <th scope="col">Modalidade</th>
                    <th scope="col">Palavras</th>
                    <th scope="col">Tentativas</th>
                    <th scope="col">Respostas gravadas</th>
                  </tr>
                </thead>
                <tbody>
                  {overview?.rounds.map((round) => (
                    <tr key={round.id}>
                      <td>{round.roundOrder}</td>
                      <td>{CHAMPIONSHIP_MODE_LABEL[round.mode]}</td>
                      <td>{round.boardCount}</td>
                      <td>{round.maxAttempts}</td>
                      <td>
                        {round.answerCount}/{round.boardCount}
                        {round.answers !== null ? ` · ${round.answers.join(", ")}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="panel-footnote">
              As respostas so aparecem aqui depois do encerramento, mesmo para administradores.
            </p>
          </section>

          <section aria-labelledby="admin-participants-title">
            <h2 id="admin-participants-title">
              {CHAMPIONSHIP_BRAND.participantLabelPlural} ({overview?.participants.length ?? 0})
            </h2>
            <div className="table-scroll">
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Situacao</th>
                    <th scope="col">Modalidades</th>
                    <th scope="col">Pontos</th>
                    <th scope="col">Posicao</th>
                  </tr>
                </thead>
                <tbody>
                  {overview?.participants.map((participant) => (
                    <tr key={participant.id}>
                      <td>{participant.displayName}</td>
                      <td>{participant.status}</td>
                      <td>{participant.completedRounds}/4</td>
                      <td>{participant.totalScore}</td>
                      <td>{participant.finalPosition ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
