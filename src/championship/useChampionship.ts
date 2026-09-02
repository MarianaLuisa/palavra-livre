import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IN_PROGRESS_POLL_INTERVAL_MS,
  LOBBY_POLL_INTERVAL_MS,
} from "./config";
import { getErrorMessage } from "./errors";
import { getChampionshipService, preserveVisibleBoardRows } from "./service";
import {
  getRoundId,
  type ChampionshipRoundState,
  type ChampionshipState,
} from "./types";

type UseChampionshipResult = {
  state: ChampionshipState | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  configured: boolean;
  authenticated: boolean;
  currentRound: ChampionshipRoundState | null;
  refresh: () => Promise<void>;
  register: (displayName: string) => Promise<boolean>;
  cancelRegistration: () => Promise<boolean>;
  abandon: () => Promise<boolean>;
  startRound: (roundId: string) => Promise<boolean>;
  submitAttempt: (roundId: string, word: string) => Promise<boolean>;
  clearError: () => void;
};

/**
 * Estado do campeonato sempre vindo do servidor.
 * Nada de pontuacao, respostas ou posicao calculados no navegador.
 */
export function useChampionship(): UseChampionshipResult {
  const service = useMemo(() => getChampionshipService(), []);
  const [state, setState] = useState<ChampionshipState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(() => service.isAuthenticated());
  const configured = service.isConfigured();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyState = useCallback((nextState: ChampionshipState) => {
    if (mountedRef.current) {
      setState((previousState) => preserveVisibleBoardRows(previousState, nextState));
      setError(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }

    try {
      const nextState = await service.getState();
      applyState(nextState);
    } catch (caughtError) {
      if (mountedRef.current) {
        setError(getErrorMessage(caughtError));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [applyState, configured, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Sincronizacao periodica: a contagem regressiva nunca decide sozinha.
  const championshipStatus = state?.championship?.status ?? null;

  useEffect(() => {
    if (!configured || championshipStatus === null) {
      return;
    }

    const interval =
      championshipStatus === "IN_PROGRESS"
        ? IN_PROGRESS_POLL_INTERVAL_MS
        : championshipStatus === "REGISTRATION_OPEN" ||
            championshipStatus === "WAITING" ||
            championshipStatus === "CALCULATING_RESULTS"
          ? LOBBY_POLL_INTERVAL_MS
          : null;

    if (interval === null) {
      return;
    }

    const timerId = window.setInterval(() => {
      void refresh();
    }, interval);

    return () => window.clearInterval(timerId);
  }, [championshipStatus, configured, refresh]);

  const run = useCallback(
    async (action: () => Promise<ChampionshipState>): Promise<boolean> => {
      setBusy(true);
      try {
        const nextState = await action();
        applyState(nextState);
        setAuthenticated(service.isAuthenticated());
        return true;
      } catch (caughtError) {
        if (mountedRef.current) {
          setError(getErrorMessage(caughtError));
        }
        return false;
      } finally {
        if (mountedRef.current) {
          setBusy(false);
        }
      }
    },
    [applyState, service],
  );

  const register = useCallback(
    (displayName: string) => run(() => service.register(displayName)),
    [run, service],
  );

  const cancelRegistration = useCallback(
    () => run(() => service.cancelRegistration()),
    [run, service],
  );

  const abandon = useCallback(() => run(() => service.abandon()), [run, service]);

  const startRound = useCallback(
    (roundId: string) => {
      if (!roundId) {
        setError("Modalidade inválida.");
        return Promise.resolve(false);
      }
      return run(() => service.startRound(roundId));
    },
    [run, service],
  );

  const submitAttempt = useCallback(
    (roundId: string, word: string) => run(() => service.submitAttempt(roundId, word)),
    [run, service],
  );

  const currentRound = useMemo(() => {
    if (state === null || !state.currentRoundId) {
      return null;
    }

    const safeRounds = Array.isArray(state?.rounds) ? state.rounds : [];
    return (safeRounds ?? []).find((round) => getRoundId(round) === state?.currentRoundId) ?? safeRounds[0] ?? null;
  }, [state]);

  return {
    state,
    loading,
    busy,
    error,
    configured,
    authenticated,
    currentRound,
    refresh,
    register,
    cancelRegistration,
    abandon,
    startRound,
    submitAttempt,
    clearError: useCallback(() => setError(null), []),
  };
}

/** Contagem regressiva ancorada no horario do servidor. */
export function useCountdown(targetIso: string | null, serverNowIso: string | null): number {
  const [remaining, setRemaining] = useState(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (serverNowIso === null) {
      return;
    }

    // Diferenca entre o relogio do servidor e o do dispositivo.
    offsetRef.current = Date.parse(serverNowIso) - Date.now();
  }, [serverNowIso]);

  useEffect(() => {
    if (targetIso === null) {
      setRemaining(0);
      return;
    }

    const target = Date.parse(targetIso);

    function tick() {
      setRemaining(Math.max(target - (Date.now() + offsetRef.current), 0));
    }

    tick();
    const timerId = window.setInterval(tick, 1000);
    return () => window.clearInterval(timerId);
  }, [targetIso]);

  return remaining;
}
