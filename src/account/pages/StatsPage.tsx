import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "../../championship/errors";
import { formatDate, formatDuration, formatScore } from "../../championship/format";
import { formatWeekdayFullName } from "../../championship/weeklyChampionshipDomain";
import { buildWeeklyChampionshipGroups } from "../championshipHistoryGrouping";
import { MODE_LABEL_PT, MONTH_NAMES } from "../config";
import { getAccountService } from "../service";
import type { AggregateStats, PeriodComparison, PlayerStats } from "../types";

type PeriodId = "THIS_MONTH" | "LAST_MONTH" | "LAST_3_MONTHS" | "ALL_TIME";

const PERIOD_LABEL: Record<PeriodId, string> = {
  THIS_MONTH: "Este mês",
  LAST_MONTH: "Mês anterior",
  LAST_3_MONTHS: "Últimos 3 meses",
  ALL_TIME: "Todo o período",
};

function monthStartOf(date?: string | null, delta = 0): string {
  const safe = typeof date === "string" && date.length >= 7 ? date : new Date().toISOString().slice(0, 10);
  const value = new Date(`${safe.slice(0, 8)}01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + delta);
  return value.toISOString().slice(0, 10);
}

function monthEndOf(monthStart?: string | null): string {
  const safe = typeof monthStart === "string" && monthStart.length >= 7 ? monthStart : new Date().toISOString().slice(0, 10);
  const value = new Date(`${safe}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  value.setUTCDate(0);
  return value.toISOString().slice(0, 10);
}

function resolvePeriod(period: PeriodId, today?: string | null): { from: string | null; to: string | null } {
  const safeToday = typeof today === "string" && today.length >= 10 ? today : new Date().toISOString().slice(0, 10);
  switch (period) {
    case "THIS_MONTH":
      return { from: monthStartOf(safeToday), to: monthEndOf(monthStartOf(safeToday)) };
    case "LAST_MONTH": {
      const start = monthStartOf(safeToday, -1);
      return { from: start, to: monthEndOf(start) };
    }
    case "LAST_3_MONTHS":
      return { from: monthStartOf(safeToday, -2), to: monthEndOf(monthStartOf(safeToday)) };
    case "ALL_TIME":
      return { from: null, to: null };
  }
}

function monthLabel(monthStart?: string | null): string {
  if (typeof monthStart !== "string" || monthStart.length < 7) {
    return "Mês";
  }
  const index = Number(monthStart.slice(5, 7)) - 1;
  const name = MONTH_NAMES[index] ?? "";
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "Mês";
}

/** Mostra a variação entre dois números, com sinal e direção. */
function Delta({ from, to, suffix = "" }: { from: number; to: number; suffix?: string }) {
  const difference = to - from;
  const className =
    difference > 0 ? "delta up" : difference < 0 ? "delta down" : "delta flat";
  const sign = difference > 0 ? "+" : "";

  return (
    <span className={className}>
      {from}
      {suffix} → {to}
      {suffix}{" "}
      <small>
        ({sign}
        {difference}
        {suffix})
      </small>
    </span>
  );
}

export function StatsPage() {
  const service = useMemo(() => getAccountService(), []);
  const [period, setPeriod] = useState<PeriodId>("THIS_MONTH");
  const [data, setData] = useState<PlayerStats | null>(null);
  const [comparison, setComparison] = useState<PeriodComparison | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof service.getChampionshipHistory>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPeriod: PeriodId) => {
      setLoading(true);

      try {
        const [statsResult, historyResult] = await Promise.allSettled([
          service.getPlayerStats(null, null),
          service.getChampionshipHistory(200, 0),
        ]);

        const base = statsResult.status === "fulfilled" ? statsResult.value : null;
        const historyData = historyResult.status === "fulfilled" ? historyResult.value : [];
        setHistory(historyData);

        if (base) {
          const range = resolvePeriod(targetPeriod, base.today);
          let scoped = base;
          if (range.from !== null || range.to !== null) {
            try {
              scoped = await service.getPlayerStats(range.from, range.to);
            } catch {
              scoped = base;
            }
          }
          setData(scoped);

          // Comparação fixa: mês anterior contra mês atual.
          const thisMonth = monthStartOf(base.today);
          const lastMonth = monthStartOf(base.today, -1);
          try {
            const comp = await service.comparePeriods(
              lastMonth,
              monthEndOf(lastMonth),
              thisMonth,
              monthEndOf(thisMonth),
            );
            setComparison(comp);
          } catch {
            setComparison(null);
          }
          setError(null);
        } else {
          // Fallback seguro se não houver dados ainda
          const todayIso = new Date().toISOString().slice(0, 10);
          setData({
            today: todayIso,
            memberSince: new Date().toISOString(),
            streak: { current: 0, longest: 0, lastActiveDate: null, atRisk: false },
            stats: {
              from: null,
              to: null,
              games: 0,
              completedGames: 0,
              incompleteGames: 0,
              completionRate: 0,
              wordsSolved: 0,
              wordsTotal: 0,
              attempts: 0,
              averageAttempts: 0,
              durationMs: 0,
              averageDurationMs: 0,
              activeDays: 0,
              byMode: [],
              championship: {
                played: 0,
                wins: 0,
                podiums: 0,
                bestPosition: null,
                bestScore: 0,
                averageScore: 0,
                wordsSolved: 0,
                attempts: 0,
                durationMs: 0,
              },
            },
          });
          setComparison(null);
          setError(null);
        }
      } catch (caughtError) {
        console.error("[estatisticas] falha ao carregar", caughtError);
        setError(getErrorMessage(caughtError));
      } finally {
        setLoading(false);
      }
    },
    [service],
  );

  useEffect(() => {
    void load(period);
  }, [load, period]);

  if (loading && data === null) {
    return (
      <div className="progress-layout">
        <header className="progress-hero">
          <div>
            <p className="eyebrow">Estatísticas</p>
            <h1>Seu desempenho</h1>
          </div>
        </header>
        <section className="account-section">
          <p className="loading-state">Carregando estatísticas...</p>
        </section>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="progress-layout">
        <header className="progress-hero">
          <div>
            <p className="eyebrow">Estatísticas</p>
            <h1>Seu desempenho</h1>
          </div>
        </header>
        <section className="account-section">
          <p className="panel-error" role="alert">
            {error ?? "Não foi possível carregar suas estatísticas."}
          </p>
          <button className="secondary-button" type="button" onClick={() => void load(period)}>
            Tentar novamente
          </button>
        </section>
      </div>
    );
  }

  const stats: AggregateStats = data.stats;
  const championship = stats?.championship ?? {
    played: 0,
    wins: 0,
    podiums: 0,
    bestPosition: null,
    bestScore: 0,
    averageScore: 0,
    wordsSolved: 0,
    attempts: 0,
    durationMs: 0,
  };
  const weeklyGroups = useMemo(() => buildWeeklyChampionshipGroups(history), [history]);

  const ALL_MODES: Array<"SIMPLE" | "DUET" | "QUARTET" | "SEXTET"> = [
    "SIMPLE",
    "DUET",
    "QUARTET",
    "SEXTET",
  ];

  const populatedByMode = ALL_MODES.map((mode) => {
    const existing = stats?.byMode?.find((m) => m.mode === mode);
    if (existing) return existing;
    return {
      mode,
      games: 0,
      completed: 0,
      incomplete: 0,
      completionRate: 0,
      averageAttempts: 0,
      bestAttempts: null,
      wordsSolved: 0,
      wordsTotal: mode === "SIMPLE" ? 1 : mode === "DUET" ? 2 : mode === "QUARTET" ? 4 : 6,
      durationMs: 0,
    };
  });

  return (
    <div className="progress-layout">
      <header className="progress-hero">
        <div>
          <p className="eyebrow">Estatísticas</p>
          <h1>Seu desempenho</h1>
        </div>
      </header>

      <nav className="period-tabs" aria-label="Período">
        {(Object.keys(PERIOD_LABEL) as PeriodId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={id === period ? "period-tab active" : "period-tab"}
            aria-pressed={id === period}
            onClick={() => setPeriod(id)}
          >
            {PERIOD_LABEL[id]}
          </button>
        ))}
      </nav>

      <section className="account-section" aria-labelledby="general-title">
        <h2 id="general-title">Geral</h2>
        <dl className="stat-grid">
          <div>
            <dt>Partidas</dt>
            <dd>{stats.games}</dd>
          </div>
          <div>
            <dt>Completas</dt>
            <dd>{stats.completedGames}</dd>
          </div>
          <div>
            <dt>Incompletas</dt>
            <dd>{stats.incompleteGames}</dd>
          </div>
          <div>
            <dt>Aproveitamento</dt>
            <dd>{stats.completionRate}%</dd>
          </div>
          <div>
            <dt>Palavras resolvidas</dt>
            <dd>
              {stats.wordsSolved}/{stats.wordsTotal}
            </dd>
          </div>
          <div>
            <dt>Tentativas</dt>
            <dd>{stats.attempts}</dd>
          </div>
          <div>
            <dt>Média de tentativas</dt>
            <dd>{stats.averageAttempts}</dd>
          </div>
          <div>
            <dt>Dias ativos</dt>
            <dd>{stats.activeDays}</dd>
          </div>
          <div>
            <dt>Maior sequência</dt>
            <dd>{data.streak.longest}</dd>
          </div>
          {stats.averageDurationMs > 0 ? (
            <div>
              <dt>Tempo médio</dt>
              <dd>{formatDuration(stats.averageDurationMs)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="account-section" aria-labelledby="stats-modes-title">
        <h2 id="stats-modes-title">Por modo</h2>
        <ul className="mode-list">
          {populatedByMode.map((entry) => (
            <li key={entry.mode} className="mode-card">
              <header>
                <strong>{MODE_LABEL_PT[entry.mode] ?? entry.mode}</strong>
                <span>{entry.games} partidas</span>
              </header>
              {entry.games === 0 ? (
                <p className="muted">Nenhuma partida no período.</p>
              ) : (
                <dl>
                  <div>
                    <dt>{entry.mode === "SIMPLE" ? "Vitórias" : "Conclusões completas"}</dt>
                    <dd>{entry.completed}</dd>
                  </div>
                  <div>
                    <dt>Incompletas</dt>
                    <dd>{entry.incomplete}</dd>
                  </div>
                  <div>
                    <dt>{entry.mode === "SIMPLE" ? "Taxa de vitória" : "Taxa de conclusão"}</dt>
                    <dd>{entry.completionRate}%</dd>
                  </div>
                  <div>
                    <dt>Tentativas médias</dt>
                    <dd>{entry.averageAttempts}</dd>
                  </div>
                  <div>
                    <dt>Palavras</dt>
                    <dd>
                      {entry.wordsSolved}/{entry.wordsTotal}
                    </dd>
                  </div>
                  {entry.bestAttempts !== null ? (
                    <div>
                      <dt>Melhor resultado</dt>
                      <dd>{entry.bestAttempts} tentativas</dd>
                    </div>
                  ) : null}
                </dl>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="account-section" aria-labelledby="stats-championship-title">
        <h2 id="stats-championship-title">Campeonato Norte</h2>

          {weeklyGroups.length > 0 ? (
            <div style={{ marginBottom: "1.5rem" }}>
              <div className="mode-card" style={{ marginBottom: "1rem" }}>
                <header>
                  <strong style={{ fontSize: "1.1rem" }}>Semana Atual — {weeklyGroups[0].dateRangeLabel}</strong>
                  <span>{weeklyGroups[0].completedDays}/5 rodadas concluídas</span>
                </header>
                <dl className="stat-grid" style={{ marginTop: "0.75rem" }}>
                  <div>
                    <dt>Pontuação acumulada</dt>
                    <dd style={{ fontSize: "1.25rem", fontWeight: "bold" }}>
                      {formatScore(weeklyGroups[0].totalScore)} pts
                    </dd>
                  </div>
                  <div>
                    <dt>Palavras resolvidas</dt>
                    <dd>{weeklyGroups[0].totalWordsSolved}</dd>
                  </div>
                  <div>
                    <dt>Tentativas totais</dt>
                    <dd>{weeklyGroups[0].totalAttempts}</dd>
                  </div>
                  <div>
                    <dt>Tempo total</dt>
                    <dd>{formatDuration(weeklyGroups[0].totalDurationMs)}</dd>
                  </div>
                </dl>
              </div>

              <h3>Rodadas diárias da semana (Segunda a Sexta)</h3>
              <p className="panel-subtitle" style={{ marginBottom: "0.75rem" }}>
                Desempenho isolado em cada dia útil da edição vigente.
              </p>
              <ul className="mode-list">
                {weeklyGroups[0].dailyEntries.map((dayEntry) => {
                  const dateObj = new Date(`${dayEntry.championshipDate}T12:00:00Z`);
                  const weekdayNum = dateObj.getUTCDay() === 0 ? 7 : dateObj.getUTCDay();

                  return (
                    <li key={dayEntry.championshipId} className="mode-card">
                      <header>
                        <strong>{formatWeekdayFullName(weekdayNum)} ({formatDate(dayEntry.championshipDate)})</strong>
                        <span>
                          {dayEntry.participated ? (
                            <span className="status-chip status-finished">Jogada</span>
                          ) : (
                            <span className="status-chip status-open">Pendente</span>
                          )}
                        </span>
                      </header>
                      {dayEntry.participated ? (
                        <dl>
                          <div>
                            <dt>Pontuação</dt>
                            <dd><strong>{formatScore(dayEntry.totalScore)} pts</strong></dd>
                          </div>
                          <div>
                            <dt>Palavras resolvidas</dt>
                            <dd>{dayEntry.wordsSolved ?? 0}/{dayEntry.wordsTotal}</dd>
                          </div>
                          <div>
                            <dt>Modalidades</dt>
                            <dd>{dayEntry.completedRounds ?? 0}/4</dd>
                          </div>
                          <div>
                            <dt>Tentativas</dt>
                            <dd>{dayEntry.attempts ?? "—"}</dd>
                          </div>
                          <div>
                            <dt>Tempo</dt>
                            <dd>{formatDuration(dayEntry.durationMs)}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="muted" style={{ margin: "0.5rem 0 0" }}>
                          Não participou desta rodada.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="empty-state" style={{ marginBottom: "1rem" }}>
              Nenhuma participação no Campeonato Norte registrada neste período. Jogue a rodada diária de Segunda a Sexta para registrar seu desempenho!
            </p>
          )}

          <h3>Métricas gerais históricas</h3>
          <dl className="stat-grid" style={{ marginTop: "0.5rem" }}>
            <div>
              <dt>Rodadas disputadas</dt>
              <dd>{championship.played}</dd>
            </div>
            <div>
              <dt>Vitórias</dt>
              <dd>{championship.wins}</dd>
            </div>
            <div>
              <dt>Pódios</dt>
              <dd>{championship.podiums}</dd>
            </div>
            <div>
              <dt>Melhor posição</dt>
              <dd>
                {championship.bestPosition === null
                  ? "—"
                  : `${championship.bestPosition}º`}
              </dd>
            </div>
            <div>
              <dt>Melhor pontuação diária</dt>
              <dd>{formatScore(championship.bestScore)} pts</dd>
            </div>
            <div>
              <dt>Pontuação média diária</dt>
              <dd>{formatScore(championship.averageScore)} pts</dd>
            </div>
          </dl>
        </section>

      {comparison !== null ? (
        <section className="account-section" aria-labelledby="comparison-title">
          <h2 id="comparison-title">
            {monthLabel(comparison.first.from ?? "")} × {monthLabel(comparison.second.from ?? "")}
          </h2>
          <dl className="comparison-list">
            <div>
              <dt>Partidas</dt>
              <dd>
                <Delta from={comparison.first.games} to={comparison.second.games} />
              </dd>
            </div>
            <div>
              <dt>Completas</dt>
              <dd>
                <Delta
                  from={comparison.first.completedGames}
                  to={comparison.second.completedGames}
                />
              </dd>
            </div>
            <div>
              <dt>Aproveitamento</dt>
              <dd>
                <Delta
                  from={comparison.first.completionRate}
                  to={comparison.second.completionRate}
                  suffix="%"
                />
              </dd>
            </div>
            <div>
              <dt>Dias ativos</dt>
              <dd>
                <Delta from={comparison.first.activeDays} to={comparison.second.activeDays} />
              </dd>
            </div>
            <div>
              <dt>Palavras resolvidas</dt>
              <dd>
                <Delta
                  from={comparison.first.wordsSolved}
                  to={comparison.second.wordsSolved}
                />
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {error !== null ? (
        <p className="panel-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
