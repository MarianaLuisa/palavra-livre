import { useEffect, useState } from "react";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_ROUTES } from "../config";
import { getErrorMessage } from "../errors";
import { formatDate, formatDuration, formatPosition, formatScore } from "../format";
import { getChampionshipService } from "../service";
import type { ChampionshipHistoryItem, ChampionshipPlayerStats } from "../types";
import { Link } from "../../router/router";

export function HistoryPage() {
  const [history, setHistory] = useState<ChampionshipHistoryItem[]>([]);
  const [stats, setStats] = useState<ChampionshipPlayerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const service = getChampionshipService();

    if (!service.isConfigured()) {
      setLoading(false);
      setError(getErrorMessage("NOT_CONFIGURED"));
      return;
    }

    Promise.all([
      service.getHistory(20, 0),
      service.isAuthenticated() ? service.getPlayerStats() : Promise.resolve(null),
    ])
      .then(([historyData, statsData]) => {
        if (!active) {
          return;
        }
        setHistory(historyData);
        setStats(statsData);
        setError(null);
      })
      .catch((caughtError) => {
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
  }, []);

  return (
    <section className="championship-panel" aria-labelledby="history-title">
      <header className="panel-header">
        <h1 id="history-title">Historico</h1>
        <p className="panel-subtitle">Campeonatos anteriores, campeoes e palavras usadas.</p>
      </header>

      {loading ? <p className="loading-state">Carregando historico...</p> : null}
      {error !== null ? (
        <p className="panel-error" role="alert">
          {error}
        </p>
      ) : null}

      {stats !== null && stats.championshipsPlayed > 0 ? (
        <section aria-labelledby="my-stats-title">
          <h2 id="my-stats-title">Suas estatisticas</h2>
          <dl className="panel-grid">
            <div>
              <dt>Campeonatos</dt>
              <dd>{stats.championshipsPlayed}</dd>
            </div>
            <div>
              <dt>Vitorias</dt>
              <dd>{stats.wins}</dd>
            </div>
            <div>
              <dt>Podios</dt>
              <dd>{stats.podiums}</dd>
            </div>
            <div>
              <dt>Melhor pontuacao</dt>
              <dd>{formatScore(stats.bestScore)}</dd>
            </div>
            <div>
              <dt>Media de pontos</dt>
              <dd>{formatScore(stats.averageScore)}</dd>
            </div>
            <div>
              <dt>Media de colocacao</dt>
              <dd>{stats.averagePosition === 0 ? "-" : stats.averagePosition}</dd>
            </div>
            <div>
              <dt>Palavras descobertas</dt>
              <dd>{stats.totalWordsSolved}</dd>
            </div>
            <div>
              <dt>Melhor tempo</dt>
              <dd>{formatDuration(stats.bestDurationMs)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {!loading && history.length === 0 && error === null ? (
        <p className="empty-state">Nenhum {CHAMPIONSHIP_BRAND.eventLabel} encerrado ainda.</p>
      ) : null}

      <ul className="history-list">
        {history.map((item) => (
          <li key={item.championshipId} className="history-card">
            <header>
              <h2>{formatDate(item.championshipDate)}</h2>
              <small>
                {item.participantCount} {CHAMPIONSHIP_BRAND.participantLabelPlural} ·{" "}
                {formatDuration(item.durationMs)}
              </small>
            </header>

            <ol className="history-podium">
              {item.podium.map((place) => (
                <li key={place.position}>
                  <strong>{place.position}º</strong> {place.displayName} ·{" "}
                  {formatScore(place.totalScore)} pts · {place.wordsSolved}/13
                </li>
              ))}
            </ol>

            {item.myResult !== null ? (
              <p className="history-mine">
                Voce: {formatPosition(item.myResult.position)} ·{" "}
                {formatScore(item.myResult.totalScore)} pts · {item.myResult.wordsSolved}/13
                palavras
              </p>
            ) : null}

            <details>
              <summary>Palavras usadas</summary>
              <p className="answers-inline">{item.answers.join(", ")}</p>
            </details>
          </li>
        ))}
      </ul>

      <div className="panel-actions">
        <Link className="ghost-button" to={CHAMPIONSHIP_ROUTES.championship}>
          Voltar ao {CHAMPIONSHIP_BRAND.eventLabel}
        </Link>
      </div>
    </section>
  );
}
