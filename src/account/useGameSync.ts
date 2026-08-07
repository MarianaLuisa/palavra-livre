import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FinishedGamePayload } from "../types/game";
import { useAuth } from "./AuthProvider";
import {
  buildRecordGameInput,
  loadPendingGames,
  queuePendingGame,
  removePendingGame,
} from "./gameRecorder";
import { getAccountService } from "./service";

/**
 * Persistencia das partidas do Jogo Livre.
 *
 * Visitante continua exatamente como antes: nada sai do navegador.
 * Com conta, cada partida concluida vira uma linha no servidor.
 *
 * Idempotencia em tres camadas:
 *   1. o identificador da partida nasce quando ela comeca e sobrevive ao
 *      refresh, porque fica no mesmo localStorage do progresso;
 *   2. reenvios sao guardados numa fila local ate o servidor confirmar;
 *   3. o banco recusa duplicata pelo indice unique (user_id, client_game_id).
 */
export function useGameSync() {
  const { isAuthenticated } = useAuth();
  const service = useMemo(() => getAccountService(), []);
  const flushingRef = useRef(false);

  const flushPending = useCallback(async () => {
    if (!isAuthenticated || flushingRef.current) {
      return;
    }

    const pending = loadPendingGames();

    if (pending.length === 0) {
      return;
    }

    flushingRef.current = true;

    try {
      for (const game of pending) {
        try {
          await service.recordGame(game);
          removePendingGame(game.clientGameId);
        } catch (error) {
          console.error("[progresso] falha ao reenviar partida pendente", error);
          // Para no primeiro erro: provavelmente rede. Tenta de novo depois.
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [isAuthenticated, service]);

  // Ao entrar na conta, envia o que ficou pendente.
  useEffect(() => {
    void flushPending();
  }, [flushPending]);

  const recordFinishedGame = useCallback(
    (payload: FinishedGamePayload) => {
      if (!isAuthenticated) {
        return;
      }

      const input = buildRecordGameInput({
        clientGameId: payload.gameId,
        mode: payload.mode,
        attemptsUsed: payload.attemptsUsed,
        wordsSolved: payload.wordsSolved,
        startedAt: payload.startedAt,
        finishedAt: payload.finishedAt,
      });

      // Enfileira antes de tentar: se a aba fechar no meio, nao se perde.
      queuePendingGame(input);

      void service
        .recordGame(input)
        .then(() => removePendingGame(input.clientGameId))
        .catch((error) => {
          console.error("[progresso] falha ao registrar a partida", error);
        });
    },
    [isAuthenticated, service],
  );

  return { recordFinishedGame, flushPending };
}
