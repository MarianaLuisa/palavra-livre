import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "../../errors";
import { formatDate, formatDuration, formatScore } from "../../format";
import { CHAMPIONSHIP_MODE_LABEL } from "../../config";
import { getChampionshipService } from "../../service";
import type { AdminPlayer, AdminPlayerHistory } from "../../types";

type SortKey = "recent" | "games" | "championships" | "name";

const SORT_LABEL: Record<SortKey, string> = {
  recent: "Atividade recente",
  games: "Mais partidas",
  championships: "Mais campeonatos",
  name: "Nome",
};

function sortPlayers(players: AdminPlayer[], key: SortKey): AdminPlayer[] {
  const byName = (player: AdminPlayer) =>
    (player.username ?? player.displayName ?? "").toLowerCase();

  return [...players].sort((left, right) => {
    switch (key) {
      case "games":
        return right.games - left.games;
      case "championships":
        return right.championshipsPlayed - left.championshipsPlayed;
      case "name":
        return byName(left).localeCompare(byName(right));
      case "recent":
      default: {
        const leftDate = left.lastPlayedDate ?? left.lastChampionshipDate ?? "";
        const rightDate = right.lastPlayedDate ?? right.lastChampionshipDate ?? "";
        return rightDate.localeCompare(leftDate);
      }
    }
  });
}

/** Ultima atividade da pessoa, vinda das duas origens. */
function lastActivity(player: AdminPlayer): string | null {
  const dates = [player.lastPlayedDate, player.lastChampionshipDate].filter(
    (value): value is string => value !== null,
  );

  return dates.length === 0 ? null : dates.sort().at(-1)!;
}

/**
 * Aba de jogadores do painel administrativo.
 *
 * Nao exibe e-mail nem qualquer dado de autenticacao: as pessoas sao
 * identificadas pelo nome de usuario, como no resto do projeto.
 */
export function AdminPlayersPanel() {
  const service = useMemo(() => getChampionshipService(), []);
  const [players, setPlayers] = useState<AdminPlayer[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [search, setSearch] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<AdminPlayerHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPlayers(await service.listPlayers());
      setError(null);
    } catch (caughtError) {
      console.error("[admin] falha ao listar jogadores", caughtError);
      setError(getErrorMessage(caughtError));
    }
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  const openPlayer = useCallback(
    async (userId: string) => {
      if (openUserId === userId) {
        setOpenUserId(null);
        setHistory(null);
        return;
      }

      setOpenUserId(userId);
      setHistory(null);
      setLoadingHistory(true);

      try {
        setHistory(await service.getPlayerGames(userId, 40, 0));
        setError(null);
      } catch (caughtError) {
        console.error("[admin] falha ao carregar historico do jogador", caughtError);
        setError(getErrorMessage(caughtError));
      } finally {
        setLoadingHistory(false);
      }
    },
    [openUserId, service],
  );

  if (players === null) {
    return (
      <section className="admin-section">
        {error === null ? (
          <p className="loading-state">Carregando jogadores...</p>
        ) : (
          <p className="panel-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  const term = search.trim().toLowerCase();
  const visible = sortPlayers(players, sortKey).filter((player) =>
    term.length === 0
      ? true
      : (player.username ?? "").toLowerCase().includes(term) ||
        player.displayName.toLowerCase().includes(term),
  );

  const permanentCount = players.filter((player) => player.isPermanent).length;

  return (
    <>
      <section className="admin-section" aria-labelledby="admin-players-title">
        <h2 id="admin-players-title">Jogadores</h2>
        <p className="admin-section-hint">
          {players.length} {players.length === 1 ? "conta" : "contas"} · {permanentCount} com
          e-mail e senha · {players.length - permanentCount} sem conta permanente. O e-mail nao
          e exibido aqui; consulte o painel do Supabase se precisar.
        </p>

        <div className="admin-players-toolbar">
          <input
            className="text-input"
            type="search"
            value={search}
            placeholder="Buscar por nome de usuario"
            aria-label="Buscar jogador"
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="period-tabs">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={key === sortKey ? "period-tab active" : "period-tab"}
                aria-pressed={key === sortKey}
                onClick={() => setSortKey(key)}
              >
                {SORT_LABEL[key]}
              </button>
            ))}
          </div>
          <button className="secondary-button" type="button" onClick={() => void load()}>
            Atualizar
          </button>
        </div>

        {error !== null ? (
          <p className="panel-error" role="alert">
            {error}
          </p>
        ) : null}

        {visible.length === 0 ? (
          <p className="empty-state">Nenhum jogador encontrado.</p>
        ) : (
          <div className="table-scroll">
            <table className="breakdown-table admin-players-table">
              <thead>
                <tr>
                  <th scope="col">Jogador</th>
                  <th scope="col">Desde</th>
                  <th scope="col">Partidas</th>
                  <th scope="col">Completas</th>
                  <th scope="col">Aproveit.</th>
                  <th scope="col">Dias</th>
                  <th scope="col">Campeonatos</th>
                  <th scope="col">Ultima vez</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((player) => {
                  const open = player.userId === openUserId;

                  return (
                    <tr
                      key={player.userId}
                      className={open ? "admin-player-row open" : "admin-player-row"}
                      tabIndex={0}
                      role="button"
                      aria-expanded={open}
                      onClick={() => void openPlayer(player.userId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void openPlayer(player.userId);
                        }
                      }}
                    >
                      <td>
                        <strong>{player.username ?? player.displayName}</strong>
                        {player.isAdmin ? <span className="you-badge">admin</span> : null}
                        {!player.isPermanent ? (
                          <span className="tag-chip test admin-player-tag">sem conta</span>
                        ) : null}
                      </td>
                      <td>{formatDate(player.createdAt)}</td>
                      <td>{player.games}</td>
                      <td>{player.completedGames}</td>
                      <td>{player.completionRate}%</td>
                      <td>{player.activeDays}</td>
                      <td>
                        {player.championshipsPlayed}
                        {player.championshipWins > 0 ? ` · ${player.championshipWins}x 1º` : ""}
                      </td>
                      <td>{lastActivity(player) === null ? "—" : formatDate(lastActivity(player))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openUserId !== null ? (
        <section className="admin-section" aria-labelledby="admin-player-history-title">
          <h2 id="admin-player-history-title">
            Partidas de {history?.username ?? history?.displayName ?? "..."}
          </h2>

          {loadingHistory ? <p className="loading-state">Carregando partidas...</p> : null}

          {history !== null && history.entries.length === 0 ? (
            <p className="empty-state">Esta pessoa ainda nao concluiu nenhuma partida.</p>
          ) : null}

          {history !== null && history.entries.length > 0 ? (
            <div className="table-scroll">
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Origem</th>
                    <th scope="col">Palavras</th>
                    <th scope="col">Tentativas</th>
                    <th scope="col">Resultado</th>
                    <th scope="col">Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {history.entries.map((entry, index) => (
                    <tr key={`${entry.source}-${entry.date}-${index}`}>
                      <td>{formatDate(entry.date)}</td>
                      <td>
                        {entry.source === "CHAMPIONSHIP"
                          ? "Campeonato"
                          : `Jogo Livre · ${entry.mode === null ? "" : CHAMPIONSHIP_MODE_LABEL[entry.mode]}`}
                      </td>
                      <td>
                        {entry.wordsSolved}/{entry.wordsTotal}
                      </td>
                      <td>
                        {entry.attemptsUsed}
                        {entry.maxAttempts === null ? "" : `/${entry.maxAttempts}`}
                      </td>
                      <td>
                        {entry.source === "CHAMPIONSHIP"
                          ? `${entry.position === null ? "—" : `${entry.position}º`} · ${formatScore(entry.totalScore)} pts`
                          : entry.completed
                            ? "Completa"
                            : "Incompleta"}
                      </td>
                      <td>{formatDuration(entry.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
