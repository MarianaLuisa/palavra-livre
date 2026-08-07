import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "../../championship/errors";
import { formatDuration, formatScore } from "../../championship/format";
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

function monthStartOf(date: string, delta = 0): string {
  const value = new Date(`${date.slice(0, 8)}01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + delta);
  return value.toISOString().slice(0, 10);
}

function monthEndOf(monthStart: string): string {
  const value = new Date(`${monthStart}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  value.setUTCDate(0);
  return value.toISOString().slice(0, 10);
}

function resolvePeriod(period: PeriodId, today: string): { from: string | null; to: string | null } {
  switch (period) {
    case "THIS_MONTH":
      return { from: monthStartOf(today), to: monthEndOf(monthStartOf(today)) };
    case "LAST_MONTH": {
      const start = monthStartOf(today, -1);
      return { from: start, to: monthEndOf(start) };
    }
    case "LAST_3_MONTHS":
      return { from: monthStartOf(today, -2), to: monthEndOf(monthStartOf(today)) };
    case "ALL_TIME":
      return { from: null, to: null };
  }
}

function monthLabel(monthStart: string): string {
  const index = Number(monthStart.slice(5, 7)) - 1;
  const name = MONTH_NAMES[index] ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPeriod: PeriodId) => {
      setLoading(true);

      try {
        const base = await service.getPlayerStats(null, null);
        const range = resolvePeriod(targetPeriod, base.today);
        const scoped =
          range.from === null && range.to === null
            ? base
            : await service.getPlayerStats(range.from, range.to);

        setData(scoped);

        // Comparação fixa: mês anterior contra mês atual.
        const thisMonth = monthStartOf(base.today);
        const lastMonth = monthStartOf(base.today, -1);
        setComparison(
          await service.comparePeriods(
            lastMonth,
            monthEndOf(lastMonth),
            thisMonth,
            monthEndOf(thisMonth),
          ),
        );
        setError(null);
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
      <section className="account-panel">
        <p className="loading-state">Carregando estatísticas...</p>
      </section>
    );
  }

  if (data === null) {
    return (
      <section className="account-panel">
        <p className="panel-error" role="alert">
          {error ?? "Não foi possível carregar suas estatísticas."}
        </p>
      </section>
    );
  }

  const stats: AggregateStats = data.stats;

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
          {stats.byMode.map((entry) => (
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

      {stats.championship.played > 0 ? (
        <section className="account-section" aria-labelledby="stats-championship-title">
          <h2 id="stats-championship-title">Campeonato Diário</h2>
          <dl className="stat-grid">
            <div>
              <dt>Disputados</dt>
              <dd>{stats.championship.played}</dd>
            </div>
            <div>
              <dt>Vitórias</dt>
              <dd>{stats.championship.wins}</dd>
            </div>
            <div>
              <dt>Pódios</dt>
              <dd>{stats.championship.podiums}</dd>
            </div>
            <div>
              <dt>Melhor posição</dt>
              <dd>
                {stats.championship.bestPosition === null
                  ? "—"
                  : `${stats.championship.bestPosition}º`}
              </dd>
            </div>
            <div>
              <dt>Melhor pontuação</dt>
              <dd>{formatScore(stats.championship.bestScore)}</dd>
            </div>
            <div>
              <dt>Pontuação média</dt>
              <dd>{formatScore(stats.championship.averageScore)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

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
