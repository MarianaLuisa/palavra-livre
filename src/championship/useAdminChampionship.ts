import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage, toChampionshipError } from "./errors";
import { getChampionshipService } from "./service";
import type { CreateChampionshipInput } from "./service";
import type { AdminOverview, AdminRoundAnswers, ChampionshipSchedule } from "./types";

/** Intervalos de sincronizacao do painel administrativo. */
const IDLE_POLL_MS = 15_000;
const LIVE_POLL_MS = 6_000;

export type AdminActionId =
  | "create"
  | "startNow"
  | "saveSchedule"
  | "openRegistration"
  | "closeRegistration"
  | "startIn5"
  | "startIn10"
  | "cancel"
  | "finish"
  | "redraw"
  | "recalculate"
  | "answers";

type UseAdminChampionshipResult = {
  overview: AdminOverview | null;
  answers: AdminRoundAnswers[] | null;
  loading: boolean;
  configured: boolean;
  forbidden: boolean;
  error: string | null;
  feedback: string | null;
  pendingAction: AdminActionId | null;
  refresh: () => Promise<void>;
  clearFeedback: () => void;
  createChampionship: (input?: CreateChampionshipInput) => Promise<void>;
  startNow: () => Promise<void>;
  saveSchedule: (schedule: ChampionshipSchedule) => Promise<void>;
  openRegistrationNow: () => Promise<void>;
  closeRegistrationNow: () => Promise<void>;
  startIn: (minutes: number, action: AdminActionId) => Promise<void>;
  cancelChampionship: () => Promise<void>;
  finishChampionship: () => Promise<void>;
  redrawWords: () => Promise<void>;
  recalculateRanking: () => Promise<void>;
  loadAnswers: () => Promise<void>;
};

/**
 * Estado do painel administrativo.
 *
 * Regras que este hook garante:
 *   - o horario oficial vem sempre do servidor (overview.serverNow);
 *   - toda acao releva o estado do servidor ao terminar;
 *   - so uma acao roda por vez, o que impede duplo clique;
 *   - o erro tecnico do Postgres vai para o console, nunca para a tela.
 */
export function useAdminChampionship(): UseAdminChampionshipResult {
  const service = useMemo(() => getChampionshipService(), []);
  const configured = service.isConfigured();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [answers, setAnswers] = useState<AdminRoundAnswers[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<AdminActionId | null>(null);
  const mountedRef = useRef(true);
  const pendingRef = useRef<AdminActionId | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      setError(getErrorMessage("NOT_CONFIGURED"));
      return;
    }

    try {
      const nextOverview = await service.getAdminOverview();

      if (!mountedRef.current) {
        return;
      }

      setOverview(nextOverview);
      setForbidden(false);
      setError(null);
    } catch (caughtError) {
      const championshipError = toChampionshipError(caughtError);
      console.error("[admin] falha ao carregar a visao geral", caughtError);

      if (!mountedRef.current) {
        return;
      }

      setForbidden(championshipError.code === "FORBIDDEN");
      setError(championshipError.message);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [configured, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Sincronizacao periodica: a tela nunca fica com estado antigo.
  const status = overview?.championship?.status ?? null;

  useEffect(() => {
    if (!configured || forbidden) {
      return;
    }

    const interval =
      status === "IN_PROGRESS" || status === "CALCULATING_RESULTS"
        ? LIVE_POLL_MS
        : IDLE_POLL_MS;

    const timerId = window.setInterval(() => {
      // Nao atropela uma acao em andamento.
      if (pendingRef.current === null) {
        void refresh();
      }
    }, interval);

    return () => window.clearInterval(timerId);
  }, [configured, forbidden, refresh, status]);

  const run = useCallback(
    async (
      action: AdminActionId,
      operation: () => Promise<void>,
      successMessage: string,
    ): Promise<void> => {
      // Guarda contra duplo clique e contra duas acoes simultaneas.
      if (pendingRef.current !== null) {
        return;
      }

      pendingRef.current = action;
      setPendingAction(action);
      setFeedback(null);
      setError(null);

      try {
        await operation();

        if (mountedRef.current) {
          setFeedback(successMessage);
        }
      } catch (caughtError) {
        console.error(`[admin] falha na acao "${action}"`, caughtError);

        if (mountedRef.current) {
          setError(getErrorMessage(caughtError));
        }
      } finally {
        pendingRef.current = null;

        if (mountedRef.current) {
          setPendingAction(null);
        }

        // Independentemente do resultado, releia o servidor.
        await refresh();
      }
    },
    [refresh],
  );

  const requireChampionshipId = useCallback((): string => {
    const id = overview?.championship?.id;

    if (id === undefined) {
      throw toChampionshipError("CHAMPIONSHIP_NOT_FOUND");
    }

    return id;
  }, [overview]);

  return {
    overview,
    answers,
    loading,
    configured,
    forbidden,
    error,
    feedback,
    pendingAction,
    refresh,
    clearFeedback: useCallback(() => setFeedback(null), []),

    createChampionship: useCallback(
      (input: CreateChampionshipInput = {}) =>
        run(
          "create",
          async () => {
            await service.createChampionship(input);
          },
          "Campeonato criado. As 13 palavras foram sorteadas no servidor.",
        ),
      [run, service],
    ),

    startNow: useCallback(
      () =>
        run(
          "startNow",
          async () => {
            const result = await service.startChampionshipNow(requireChampionshipId());

            if (result.alreadyStarted) {
              // Idempotente: informamos sem tratar como erro.
              setFeedback("O campeonato já estava em andamento.");
            }
          },
          "Campeonato iniciado com sucesso.",
        ),
      [requireChampionshipId, run, service],
    ),

    saveSchedule: useCallback(
      (schedule: ChampionshipSchedule) =>
        run(
          "saveSchedule",
          () => service.updateChampionshipSchedule(requireChampionshipId(), schedule),
          "Horários salvos.",
        ),
      [requireChampionshipId, run, service],
    ),

    openRegistrationNow: useCallback(
      () =>
        run(
          "openRegistration",
          () => service.openRegistrationNow(requireChampionshipId()),
          "Inscrições abertas.",
        ),
      [requireChampionshipId, run, service],
    ),

    closeRegistrationNow: useCallback(
      () =>
        run(
          "closeRegistration",
          () => service.closeRegistrationNow(requireChampionshipId()),
          "Inscrições encerradas.",
        ),
      [requireChampionshipId, run, service],
    ),

    startIn: useCallback(
      (minutes: number, action: AdminActionId) =>
        run(
          action,
          () => service.scheduleStartIn(requireChampionshipId(), minutes),
          `Início programado para daqui a ${minutes} minutos.`,
        ),
      [requireChampionshipId, run, service],
    ),

    cancelChampionship: useCallback(
      () =>
        run(
          "cancel",
          () => service.cancelChampionship(requireChampionshipId()),
          "Campeonato cancelado. Nenhum dado foi apagado.",
        ),
      [requireChampionshipId, run, service],
    ),

    finishChampionship: useCallback(
      () =>
        run(
          "finish",
          () => service.finishChampionship(requireChampionshipId()),
          "Campeonato finalizado e classificação consolidada.",
        ),
      [requireChampionshipId, run, service],
    ),

    redrawWords: useCallback(
      () =>
        run(
          "redraw",
          async () => {
            await service.redrawWords(requireChampionshipId());
          },
          "Novas palavras sorteadas no servidor.",
        ),
      [requireChampionshipId, run, service],
    ),

    recalculateRanking: useCallback(
      () =>
        run(
          "recalculate",
          () => service.recalculateRanking(requireChampionshipId()),
          "Classificação recalculada.",
        ),
      [requireChampionshipId, run, service],
    ),

    loadAnswers: useCallback(
      () =>
        run(
          "answers",
          async () => {
            const data = await service.getChampionshipAnswers(requireChampionshipId());
            setAnswers(data);
          },
          "Respostas carregadas.",
        ),
      [requireChampionshipId, run, service],
    ),
  };
}
