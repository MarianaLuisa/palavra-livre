import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "../../championship/errors";
import { formatDate, formatDuration, formatScore } from "../../championship/format";
import { getAccountService } from "../service";
import type { ChampionshipHistoryEntry } from "../types";

/**
 * Histórico pessoal no Campeonato Diário.
 * "Não participou" não é armazenado: aparece por ausência de participação
 * num campeonato que aconteceu.
 */
export function ChampionshipHistoryPage() {
  const service = useMemo(() => getAccountService(), []);
  const [entries, setEntries] = useState<ChampionshipHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    service
      .getChampionshipHistory(60, 0)
      .then((data) => {
        if (active) {
          setEntries(data);
          setError(null);
        }
      })
      .catch((caughtError) => {
        console.error("[campeonatos] falha ao carregar histórico", caughtError);

        if (active) {
          setError(getErrorMessage(caughtError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [service]);

  const played = entries.filter((entry) => entry.participated);

  return (
    <div className="progress-layout">
      <header className="progress-hero">
        <div>
          <p className="eyebrow">Campeonato Diário</p>
          <h1>Seu histórico</h1>
          <p className="panel-subtitle">
            {played.length} de {entries.length} campeonatos disputados
          </p>
        </div>
      </header>

      {loading ? <p className="loading-state">Carregando histórico...</p> : null}
      {error !== null ? (
        <p className="panel-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && entries.length === 0 ? (
        <p className="empty-state">Nenhum campeonato encerrado ainda.</p>
      ) : null}

      {entries.length > 0 ? (
        <section className="account-section">
          <div className="table-scroll">
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Posição</th>
                  <th scope="col">Pontuação</th>
                  <th scope="col">Palavras</th>
                  <th scope="col">Tentativas</th>
                  <th scope="col">Tempo</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.championshipId}
                    className={entry.position === 1 ? "leaderboard-row first" : undefined}
                  >
                    <td>{formatDate(entry.championshipDate)}</td>
                    {entry.participated ? (
                      <>
                        <td>{entry.position === null ? "—" : `${entry.position}º`}</td>
                        <td>{formatScore(entry.totalScore)} pontos</td>
                        <td>
                          {entry.wordsSolved ?? 0}/{entry.wordsTotal}
                        </td>
                        <td>{entry.attempts ?? "—"}</td>
                        <td>{formatDuration(entry.durationMs)}</td>
                      </>
                    ) : (
                      <td className="muted" colSpan={5}>
                        Não participou
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
