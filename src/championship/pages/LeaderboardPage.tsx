import { useCallback, useEffect, useState } from "react";
import { LeaderboardTable } from "../components/LeaderboardTable";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_ROUTES } from "../config";
import { getErrorMessage } from "../errors";
import { formatDate } from "../format";
import { getChampionshipService } from "../service";
import { getBrazilCurrentDate } from "../timezone";
import type { Leaderboard, LeaderboardEntry } from "../types";
import { Link } from "../../router/router";

export function LeaderboardPage() {
  const todayDate = getBrazilCurrentDate();
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<Leaderboard | null>(null);
  const [dailyLeaderboard, setDailyLeaderboard] = useState<Leaderboard | null>(null);
  const [activeTab, setActiveTab] = useState<"weekly" | "daily">("weekly");
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
      const state = service.isAuthenticated() ? await service.getState() : null;
      const [weeklyData, dailyData] = await Promise.all([
        service.getWeeklyLeaderboard(),
        service.getLeaderboard(state?.championship?.id),
      ]);

      const normalizeLeaderboard = (data: Leaderboard | null): Leaderboard | null => {
        if (!data) return null;
        const rawEntries: any[] = data.entries ?? data.participants ?? [];
        const entries: LeaderboardEntry[] = rawEntries.map((entry, index) => ({
          participantId: entry.participantId ?? entry.userId ?? `participant-${index}`,
          userId: entry.userId ?? entry.participantId ?? `user-${index}`,
          position: entry.position ?? index + 1,
          displayName: entry.displayName ?? entry.name ?? entry.display_name ?? "Jogador",
          totalScore: entry.totalScore ?? entry.score ?? entry.total_score ?? 0,
          wordsSolved: entry.wordsSolved ?? entry.words_solved ?? 0,
          completedRounds: entry.completedRounds ?? entry.completed_rounds ?? 0,
          totalAttempts: entry.totalAttempts ?? entry.total_attempts ?? null,
          totalDurationMs: entry.totalDurationMs ?? entry.total_duration_ms ?? null,
          status: entry.status ?? "FINISHED",
          dailyBreakdown: entry.dailyBreakdown,
          days: Array.isArray(entry.days)
            ? entry.days.map((d: any) => ({
                weekday: d.weekday,
                date: typeof d.date === "string" ? d.date.slice(0, 10) : d.date,
                label: d.label,
                played: Boolean(d.played),
                wordsSolved: d.wordsSolved ?? (d.played ? 0 : null),
                wordsTotal: d.wordsTotal ?? 13,
                score: d.score ?? null,
              }))
            : entry.days,
        }));

        return {
          ...data,
          totalWords: data.totalWords ?? (data.period === "weekly" ? 65 : 13),
          totalRounds: data.totalRounds ?? (data.period === "weekly" ? 20 : 4),
          entries,
        };
      };

      setWeeklyLeaderboard(normalizeLeaderboard(weeklyData));
      setDailyLeaderboard(normalizeLeaderboard(dailyData));
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

  const displayLeaderboard = activeTab === "weekly" ? weeklyLeaderboard : dailyLeaderboard;

  return (
    <section className="championship-panel" aria-labelledby="leaderboard-title">
      <header className="panel-header">
        <div>
          <p className="eyebrow">{CHAMPIONSHIP_BRAND.name}</p>
          <h1 id="leaderboard-title">Classificação Geral</h1>
        </div>
        {weeklyLeaderboard?.periodLabel ? (
          <p className="panel-subtitle">
            Semana {weeklyLeaderboard.periodLabel}
          </p>
        ) : null}
      </header>

      <nav className="period-tabs" aria-label="Visualização do Ranking" style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          className={activeTab === "weekly" ? "period-tab active" : "period-tab"}
          aria-pressed={activeTab === "weekly"}
          onClick={() => setActiveTab("weekly")}
        >
          Classificação Semanal (Principal)
        </button>
        <button
          type="button"
          className={activeTab === "daily" ? "period-tab active" : "period-tab"}
          aria-pressed={activeTab === "daily"}
          onClick={() => setActiveTab("daily")}
        >
          Rodada de Hoje ({formatDate(todayDate)})
        </button>
      </nav>

      {loading ? <p className="loading-state">Carregando classificação...</p> : null}
      {error !== null ? (
        <p className="panel-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && displayLeaderboard !== null ? (
        <>
          <section className="leaderboard-section" aria-labelledby="ranking-view-title">
            <header className="section-header compact">
              <div>
                <h2 id="ranking-view-title">
                  {activeTab === "weekly" ? "Classificação Geral da Semana" : "Resultados da Rodada Diária"}
                </h2>
                <p className="panel-subtitle">
                  {activeTab === "weekly"
                    ? "Pontuação acumulada das rodadas diárias de Segunda a Sexta."
                    : "Desempenho dos participantes na rodada de hoje."}
                </p>
              </div>
            </header>

            <LeaderboardTable
              entries={displayLeaderboard.entries}
              isFinal={displayLeaderboard.isFinal}
              isWeekly={activeTab === "weekly"}
              weekStart={weeklyLeaderboard?.weekStart}
              totalWords={displayLeaderboard.totalWords ?? (activeTab === "weekly" ? 65 : 13)}
              totalRounds={displayLeaderboard.totalRounds ?? null}
              highlightParticipantId={participantId}
              emptyMessage={
                activeTab === "weekly"
                  ? "Nenhum resultado registrado nesta semana até o momento."
                  : "Nenhum participante jogou a rodada de hoje ainda."
              }
            />
          </section>

          <div className="panel-actions">
            <button className="secondary-button" type="button" onClick={() => void load()}>
              Atualizar
            </button>
            <Link className="ghost-button" to={CHAMPIONSHIP_ROUTES.championship}>
              Voltar ao {CHAMPIONSHIP_BRAND.name}
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}
