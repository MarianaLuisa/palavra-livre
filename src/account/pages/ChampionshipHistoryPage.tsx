import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "../../championship/errors";
import { formatDate, formatDuration, formatScore } from "../../championship/format";
import {
  formatNorteWeekRange,
  formatNorteWeekTitle,
  formatWeekdayFullName,
} from "../../championship/weeklyChampionshipDomain";
import { buildWeeklyChampionshipGroups, type WeeklyChampionshipGroup } from "../championshipHistoryGrouping";
import { MODE_LABEL_PT } from "../config";
import { getAccountService } from "../service";
import type { ChampionshipHistoryEntry, MonthProgress } from "../types";

export function ChampionshipHistoryPage() {
  const service = useMemo(() => getAccountService(), []);
  const [activeTab, setActiveTab] = useState<"championships" | "freePlay">("championships");
  const [entries, setEntries] = useState<ChampionshipHistoryEntry[]>([]);
  const [monthProgress, setMonthProgress] = useState<MonthProgress | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<WeeklyChampionshipGroup | null>(null);
  const [selectedRound, setSelectedRound] = useState<ChampionshipHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      service.getChampionshipHistory(100, 0),
      service.getMonthProgress().catch(() => null),
    ])
      .then(([historyData, progressData]) => {
        if (active) {
          setEntries(historyData);
          setMonthProgress(progressData);
          setError(null);
        }
      })
      .catch((caughtError) => {
        console.error("[historico] falha ao carregar", caughtError);
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

  const groups = useMemo(() => buildWeeklyChampionshipGroups(entries), [entries]);

  // Se uma semana estiver selecionada, sincroniza com os dados atualizados
  const currentSelectedWeek = useMemo(() => {
    if (!selectedWeek) return null;
    return groups.find((g) => g.weekStart === selectedWeek.weekStart) ?? null;
  }, [groups, selectedWeek]);

  return (
    <div className="progress-layout">
      <header className="progress-hero">
        <div>
          <p className="eyebrow">Histórico Pessoal</p>
          <h1>Seus Resultados</h1>
          <p className="panel-subtitle">
            Acompanhe seu desempenho histórico em Campeonatos e no Jogo Livre.
          </p>
        </div>
      </header>

      <nav className="period-tabs" aria-label="Seção do Histórico" style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          className={activeTab === "championships" ? "period-tab active" : "period-tab"}
          aria-pressed={activeTab === "championships"}
          onClick={() => {
            setActiveTab("championships");
            setSelectedRound(null);
          }}
        >
          Campeonatos
        </button>
        <button
          type="button"
          className={activeTab === "freePlay" ? "period-tab active" : "period-tab"}
          aria-pressed={activeTab === "freePlay"}
          onClick={() => setActiveTab("freePlay")}
        >
          Jogo Livre
        </button>
      </nav>

      {loading ? <p className="loading-state">Carregando histórico...</p> : null}
      {error !== null ? (
        <p className="panel-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && activeTab === "championships" ? (
        <div className="account-section">
          {currentSelectedWeek === null ? (
            <>
              <h2>Campeonato Norte — Semanas Disputadas</h2>
              <p className="panel-subtitle" style={{ marginBottom: "1rem" }}>
                Selecione uma semana para abrir o detalhamento das rodadas diárias.
              </p>

              {groups.length === 0 ? (
                <p className="empty-state">Nenhuma participação em edições do Campeonato Norte registrada ainda.</p>
              ) : (
                <ul className="mode-list">
                  {groups.map((group) => (
                    <li
                      key={group.weekStart}
                      className="mode-card"
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setSelectedWeek(group);
                        setSelectedRound(null);
                      }}
                    >
                      <header>
                        <strong>{group.weekLabel}</strong>
                        <span>{group.dailyEntries.filter((d) => d.participated).length}/5 rodadas jogadas</span>
                      </header>
                      <dl>
                        <div>
                          <dt>Pontuação total</dt>
                          <dd style={{ fontWeight: "bold" }}>
                            {formatScore(group.totalScore)} pts
                          </dd>
                        </div>
                        <div>
                          <dt>Palavras resolvidas</dt>
                          <dd>{group.totalWordsSolved}</dd>
                        </div>
                        <div>
                          <dt>Tentativas</dt>
                          <dd>{group.totalAttempts}</dd>
                        </div>
                        <div>
                          <dt>Tempo total</dt>
                          <dd>{formatDuration(group.totalDurationMs)}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="secondary-button compact"
                        style={{ marginTop: "0.75rem", width: "100%" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWeek(group);
                          setSelectedRound(null);
                        }}
                      >
                        Ver detalhes da semana →
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div>
                  <p className="eyebrow">Campeonato Norte</p>
                  <h2>{currentSelectedWeek.weekLabel}</h2>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setSelectedWeek(null);
                    setSelectedRound(null);
                  }}
                >
                  ← Voltar para a lista de semanas
                </button>
              </div>

              <section className="account-section" style={{ marginBottom: "1.5rem" }}>
                <h3>Dados gerais da semana</h3>
                <dl className="stat-grid">
                  <div>
                    <dt>Pontuação total</dt>
                    <dd>{formatScore(currentSelectedWeek.totalScore)} pts</dd>
                  </div>
                  <div>
                    <dt>Palavras resolvidas</dt>
                    <dd>{currentSelectedWeek.totalWordsSolved}</dd>
                  </div>
                  <div>
                    <dt>Tentativas totais</dt>
                    <dd>{currentSelectedWeek.totalAttempts}</dd>
                  </div>
                  <div>
                    <dt>Rodadas completas</dt>
                    <dd>{currentSelectedWeek.completedDays}/5</dd>
                  </div>
                  <div>
                    <dt>Tempo total jogado</dt>
                    <dd>{formatDuration(currentSelectedWeek.totalDurationMs)}</dd>
                  </div>
                </dl>
              </section>

              <section className="account-section">
                <h3>Rodadas Diárias da Semana</h3>
                <p className="panel-subtitle" style={{ marginBottom: "1rem" }}>
                  Clique em uma rodada para visualizar os detalhes.
                </p>

                <div className="table-scroll">
                  <table className="breakdown-table">
                    <thead>
                      <tr>
                        <th scope="col">Dia</th>
                        <th scope="col">Data</th>
                        <th scope="col">Status</th>
                        <th scope="col">Pontuação</th>
                        <th scope="col">Palavras</th>
                        <th scope="col">Tentativas</th>
                        <th scope="col">Tempo</th>
                        <th scope="col">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentSelectedWeek.dailyEntries.map((entry) => {
                        const dateObj = new Date(`${entry.championshipDate}T12:00:00Z`);
                        const weekdayNum = dateObj.getUTCDay() === 0 ? 7 : dateObj.getUTCDay();
                        const isSelected = selectedRound?.championshipId === entry.championshipId;

                        return (
                          <tr
                            key={entry.championshipId}
                            className={isSelected ? "leaderboard-row current-user" : undefined}
                            style={{ cursor: "pointer" }}
                            onClick={() => setSelectedRound(entry)}
                          >
                            <td><strong>{formatWeekdayFullName(weekdayNum)}</strong></td>
                            <td>{formatDate(entry.championshipDate)}</td>
                            {entry.participated ? (
                              <>
                                <td>
                                  <span className="status-chip status-finished">Concluída</span>
                                </td>
                                <td><strong>{formatScore(entry.totalScore)} pts</strong></td>
                                <td>{entry.wordsSolved ?? 0}/{entry.wordsTotal}</td>
                                <td>{entry.attempts ?? "—"}</td>
                                <td>{formatDuration(entry.durationMs)}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="ghost-button compact"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedRound(entry);
                                    }}
                                  >
                                    {isSelected ? "Selecionado" : "Ver detalhe"}
                                  </button>
                                </td>
                              </>
                            ) : (
                              <td className="muted" colSpan={6}>
                                Não participou desta rodada
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {selectedRound !== null && selectedRound.participated ? (
                  <div className="account-section" style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border-color, #e5e7eb)", paddingTop: "1.5rem" }}>
                    <h3>
                      Detalhes da Rodada — {formatDate(selectedRound.championshipDate)}
                    </h3>
                    <dl className="stat-grid" style={{ marginTop: "1rem" }}>
                      <div>
                        <dt>Pontuação conquistada</dt>
                        <dd>{formatScore(selectedRound.totalScore)} pts</dd>
                      </div>
                      <div>
                        <dt>Palavras resolvidas</dt>
                        <dd>{selectedRound.wordsSolved}/{selectedRound.wordsTotal}</dd>
                      </div>
                      <div>
                        <dt>Modalidades concluídas</dt>
                        <dd>{selectedRound.completedRounds}/4</dd>
                      </div>
                      <div>
                        <dt>Tentativas utilizadas</dt>
                        <dd>{selectedRound.attempts}</dd>
                      </div>
                      <div>
                        <dt>Duração da rodada</dt>
                        <dd>{formatDuration(selectedRound.durationMs)}</dd>
                      </div>
                      <div>
                        <dt>Posição diária</dt>
                        <dd>{selectedRound.position ? `${selectedRound.position}º` : "—"}</dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </div>
      ) : null}

      {!loading && activeTab === "freePlay" ? (
        <section className="account-section">
          <h2>Histórico do Jogo Livre</h2>
          <p className="panel-subtitle">
            Partidas avulsas jogadas no modo livre (Simples, Dueto, Quarteto e Sexteto).
          </p>

          {monthProgress?.days && monthProgress.days.filter((d) => d.games > 0).length > 0 ? (
            <div className="table-scroll" style={{ marginTop: "1rem" }}>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Partidas</th>
                    <th scope="col">Completas</th>
                    <th scope="col">Palavras resolvidas</th>
                    <th scope="col">Tentativas</th>
                    <th scope="col">Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {monthProgress.days
                    .filter((day) => day.games > 0)
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((day) => (
                      <tr key={day.date}>
                        <td>{formatDate(day.date)}</td>
                        <td>{day.games}</td>
                        <td>{day.completedGames}</td>
                        <td>{day.wordsSolved}</td>
                        <td>{day.attempts}</td>
                        <td>{formatDuration(day.durationMs)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state" style={{ marginTop: "1rem" }}>
              Nenhuma partida de Jogo Livre registrada neste mês.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
