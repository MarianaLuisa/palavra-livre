import { useCallback, useEffect, useState } from "react";
import { LeaderboardTable } from "../components/LeaderboardTable";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_ROUTES, CHAMPIONSHIP_STATUS_LABEL } from "../config";
import { getErrorMessage } from "../errors";
import { formatDate } from "../format";
import { getChampionshipService } from "../service";
import type { Leaderboard } from "../types";
import { Link } from "../../router/router";

export function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<Leaderboard | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const service = getChampionshipService();

    if (!service.isConfigured()) {
      setLoading(false);
      setError(getErrorMessage("NOT_CONFIGURED"));
      return;
    }

    try {
      const [data, state] = await Promise.all([
        service.getLeaderboard(),
        service.isAuthenticated() ? service.getState() : Promise.resolve(null),
      ]);
      let weeklyData: Leaderboard | null = null;

      try {
        weeklyData = await service.getWeeklyLeaderboard();
      } catch (caughtWeeklyError) {
        console.warn("[championship] ranking semanal indisponível", caughtWeeklyError);
      }

      setLeaderboard(data);
      setWeeklyLeaderboard(weeklyData);
      setParticipantId(state?.participant?.id ?? null);
      setError(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="championship-panel" aria-labelledby="leaderboard-title">
      <header className="panel-header">
        <h1 id="leaderboard-title">Classificação</h1>
        {leaderboard?.championshipDate !== undefined ? (
          <p className="panel-subtitle">
            {CHAMPIONSHIP_BRAND.name} · {formatDate(leaderboard.championshipDate)}
          </p>
        ) : null}
        {leaderboard?.status !== undefined ? (
          <span className={`status-chip status-${leaderboard.status.toLowerCase()}`}>
            {CHAMPIONSHIP_STATUS_LABEL[leaderboard.status] ?? leaderboard.status}
          </span>
        ) : null}
      </header>

      {loading ? <p className="loading-state">Carregando classificação...</p> : null}
      {error !== null ? (
        <p className="panel-error" role="alert">
          {error}
        </p>
      ) : null}

      {leaderboard !== null && !loading ? (
        <>
          {weeklyLeaderboard !== null ? (
            <section className="leaderboard-section" aria-labelledby="weekly-leaderboard-title">
              <header className="section-header compact">
                <div>
                  <h2 id="weekly-leaderboard-title">Classificação semanal</h2>
                  <p className="panel-subtitle">
                    {weeklyLeaderboard.periodLabel ?? "Semana atual"} · soma dos resultados diários
                    finalizados.
                  </p>
                </div>
              </header>

              <LeaderboardTable
                entries={weeklyLeaderboard.entries}
                isFinal
                totalWords={weeklyLeaderboard.totalWords ?? null}
                totalRounds={weeklyLeaderboard.totalRounds ?? null}
                emptyMessage="Nenhum resultado diário finalizado nesta semana."
              />
            </section>
          ) : null}

          <section className="leaderboard-section" aria-labelledby="daily-leaderboard-title">
            <header className="section-header compact">
              <div>
                <h2 id="daily-leaderboard-title">Rodada diária</h2>
                <p className="panel-subtitle">
                  Resultado do dia. Enquanto a rodada está aberta, os detalhes ficam protegidos.
                </p>
              </div>
            </header>

          {!leaderboard.isFinal ? (
            <p className="panel-notice">
              A classificação detalhada só aparece no encerramento. Durante o{" "}
              {CHAMPIONSHIP_BRAND.eventLabel}, mostramos apenas quem está participando e quantas
              modalidades cada pessoa concluiu.
            </p>
          ) : null}

          <LeaderboardTable
            entries={leaderboard.entries}
            isFinal={leaderboard.isFinal}
            highlightParticipantId={participantId}
          />
          </section>

          <div className="panel-actions">
            <button className="secondary-button" type="button" onClick={() => void load()}>
              Atualizar
            </button>
            <Link className="ghost-button" to={CHAMPIONSHIP_ROUTES.championship}>
              Voltar ao {CHAMPIONSHIP_BRAND.eventLabel}
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}
