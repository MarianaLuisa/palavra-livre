import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDuration, formatScore } from "../../championship/format";
import { getErrorMessage } from "../../championship/errors";
import { useAuth } from "../AuthProvider";
import { DayDetail } from "../components/DayDetail";
import { MonthCalendar } from "../components/MonthCalendar";
import { StreakBadge } from "../components/StreakBadge";
import { MODE_LABEL_PT, MONTH_NAMES } from "../config";
import { getAccountService } from "../service";
import type { MonthProgress } from "../types";

function shiftMonth(month: string, delta: number): string {
  const date = new Date(`${month}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return `${date.toISOString().slice(0, 8)}01`;
}

function formatMonthTitle(month: string): string {
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return `${MONTH_NAMES[monthIndex] ?? ""} de ${month.slice(0, 4)}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ProgressPage() {
  const { profile } = useAuth();
  const service = useMemo(() => getAccountService(), []);
  const [month, setMonth] = useState<string | null>(null);
  const [progress, setProgress] = useState<MonthProgress | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetMonth: string | null) => {
      setLoading(true);

      try {
        // Uma única chamada devolve calendário, resumo, sequência e modos.
        const data = await service.getMonthProgress(targetMonth ?? undefined);
        setProgress(data);
        setMonth(data.month);
        setError(null);
      } catch (caughtError) {
        console.error("[progresso] falha ao carregar o mês", caughtError);
        setError(getErrorMessage(caughtError));
      } finally {
        setLoading(false);
      }
    },
    [service],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  function goToMonth(delta: number) {
    if (month === null || progress === null) {
      return;
    }

    const target = shiftMonth(month, delta);

    // Não navega para meses que ainda não começaram.
    if (delta > 0 && target > progress.today.slice(0, 8) + "01") {
      return;
    }

    setSelectedDate(null);
    void load(target);
  }

  if (loading && progress === null) {
    return (
      <section className="account-panel">
        <p className="loading-state">Carregando seu progresso...</p>
      </section>
    );
  }

  if (progress === null) {
    return (
      <section className="account-panel">
        <p className="panel-error" role="alert">
          {error ?? "Não foi possível carregar seu progresso."}
        </p>
        <button className="secondary-button" type="button" onClick={() => void load(null)}>
          Tentar novamente
        </button>
      </section>
    );
  }

  const summary = progress.summary;
  const selectedDay =
    selectedDate === null
      ? null
      : (progress.days.find((day) => day.date === selectedDate) ?? null);
  const canGoForward = shiftMonth(progress.month, 1) <= `${progress.today.slice(0, 8)}01`;
  const todayGames =
    progress.days.find((day) => day.date === progress.today)?.games ?? 0;

  return (
    <div className="progress-layout">
      <header className="progress-hero">
        <div>
          <p className="eyebrow">Meu progresso</p>
          <h1>Olá, {profile?.username ?? profile?.displayName ?? "jogador"}</h1>
        </div>
        <StreakBadge streak={progress.streak} />
      </header>

      <section className="account-section" aria-labelledby="calendar-title">
        <div className="month-nav">
          <button
            className="ghost-button compact"
            type="button"
            onClick={() => goToMonth(-1)}
            aria-label="Mês anterior"
          >
            ←
          </button>
          <h2 id="calendar-title">{capitalize(formatMonthTitle(progress.month))}</h2>
          <button
            className="ghost-button compact"
            type="button"
            onClick={() => goToMonth(1)}
            disabled={!canGoForward}
            aria-label="Próximo mês"
          >
            →
          </button>
        </div>

        <MonthCalendar
          month={progress.month}
          daysInMonth={progress.daysInMonth}
          today={progress.today}
          days={progress.days}
          championshipDays={progress.championshipDays}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        <p className="calendar-summary">
          <strong>{summary.activeDays}</strong> dias jogados de {progress.daysPossible}
          {progress.isCurrentMonth ? " até hoje" : ""}
        </p>

        {selectedDay !== null ? (
          <DayDetail
            day={selectedDay}
            hadChampionship={progress.championshipDays.includes(selectedDay.date)}
            onClose={() => setSelectedDate(null)}
          />
        ) : null}
      </section>

      {progress.isCurrentMonth ? (
        <section className="account-section daily-goal" aria-labelledby="goal-title">
          <h2 id="goal-title">Meta de hoje</h2>
          <p className="goal-value">
            {Math.min(todayGames, progress.dailyGoal)} / {progress.dailyGoal} partidas
          </p>
          <div
            className="goal-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.dailyGoal}
            aria-valuenow={Math.min(todayGames, progress.dailyGoal)}
          >
            <span
              style={{
                width: `${Math.min((todayGames / progress.dailyGoal) * 100, 100)}%`,
              }}
            />
          </div>
          {todayGames >= progress.dailyGoal ? (
            <p className="goal-done">Meta concluída. Jogue mais se quiser.</p>
          ) : null}
        </section>
      ) : null}

      <section className="account-section" aria-labelledby="month-summary-title">
        <h2 id="month-summary-title">Seu mês</h2>
        <dl className="stat-grid">
          <div>
            <dt>Partidas</dt>
            <dd>{summary.games}</dd>
          </div>
          <div>
            <dt>Completas</dt>
            <dd>{summary.completedGames}</dd>
          </div>
          <div>
            <dt>Aproveitamento</dt>
            <dd>{summary.completionRate}%</dd>
          </div>
          <div>
            <dt>Palavras resolvidas</dt>
            <dd>{summary.wordsSolved}</dd>
          </div>
          <div>
            <dt>Tentativas</dt>
            <dd>{summary.attempts}</dd>
          </div>
          <div>
            <dt>Dias ativos</dt>
            <dd>{summary.activeDays}</dd>
          </div>
          <div>
            <dt>Maior sequência</dt>
            <dd>{progress.streak.longest}</dd>
          </div>
          {summary.durationMs > 0 ? (
            <div>
              <dt>Tempo jogado</dt>
              <dd>{formatDuration(summary.durationMs)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="account-section" aria-labelledby="by-mode-title">
        <h2 id="by-mode-title">Por modo</h2>
        <ul className="mode-list">
          {summary.byMode.map((entry) => (
            <li key={entry.mode} className="mode-card">
              <header>
                <strong>{MODE_LABEL_PT[entry.mode] ?? entry.mode}</strong>
                <span>{entry.games} partidas</span>
              </header>
              {entry.games === 0 ? (
                <p className="muted">Nenhuma partida neste mês.</p>
              ) : (
                <dl>
                  <div>
                    <dt>{entry.mode === "SIMPLE" ? "Vitórias" : "Conclusões completas"}</dt>
                    <dd>{entry.completed}</dd>
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

      {summary.championship.played > 0 ? (
        <section className="account-section" aria-labelledby="championship-title">
          <h2 id="championship-title">Campeonatos</h2>
          <dl className="stat-grid">
            <div>
              <dt>Disputados</dt>
              <dd>{summary.championship.played}</dd>
            </div>
            <div>
              <dt>Pódios</dt>
              <dd>{summary.championship.podiums}</dd>
            </div>
            <div>
              <dt>Vitórias</dt>
              <dd>{summary.championship.wins}</dd>
            </div>
            <div>
              <dt>Melhor posição</dt>
              <dd>
                {summary.championship.bestPosition === null
                  ? "—"
                  : `${summary.championship.bestPosition}º`}
              </dd>
            </div>
            <div>
              <dt>Melhor pontuação</dt>
              <dd>{formatScore(summary.championship.bestScore)}</dd>
            </div>
            <div>
              <dt>Pontuação média</dt>
              <dd>{formatScore(summary.championship.averageScore)}</dd>
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
