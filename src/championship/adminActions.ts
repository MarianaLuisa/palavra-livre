import type { ChampionshipStatus } from "./types";

/**
 * Quais acoes administrativas fazem sentido em cada status.
 *
 * Isto e apenas ergonomia da interface. A autorizacao e as regras de
 * transicao continuam sendo validadas no banco: esconder um botao nao
 * protege nada, so evita cliques que resultariam em erro.
 */
export type AdminActionAvailability = {
  canStartNow: boolean;
  canEditSchedule: boolean;
  canOpenRegistration: boolean;
  canCloseRegistration: boolean;
  canScheduleStartIn: boolean;
  canRedrawWords: boolean;
  canCancel: boolean;
  canFinish: boolean;
  canRecalculate: boolean;
  canViewAnswers: boolean;
};

/** Status em que os horarios ainda podem ser alterados antes do dia ficar disponível. */
const SCHEDULE_EDITABLE: ChampionshipStatus[] = [
  "SCHEDULED",
  "REGISTRATION_OPEN",
  "WAITING",
];

export function getAdminActionAvailability(
  status: ChampionshipStatus | null | undefined,
): AdminActionAvailability {
  if (status === null || status === undefined) {
    return {
      canStartNow: false,
      canEditSchedule: false,
      canOpenRegistration: false,
      canCloseRegistration: false,
      canScheduleStartIn: false,
      canRedrawWords: false,
      canCancel: false,
      canFinish: false,
      canRecalculate: false,
      canViewAnswers: false,
    };
  }

  const scheduleEditable = SCHEDULE_EDITABLE.includes(status);

  return {
    // No modelo semanal, "começar agora" só antecipa um campeonato ainda agendado.
    canStartNow: scheduleEditable,
    canEditSchedule: scheduleEditable,
    canOpenRegistration: false,
    canCloseRegistration: false,
    canScheduleStartIn: false,
    canRedrawWords: scheduleEditable,
    // Cancelar vale enquanto nao terminou nem foi cancelado.
    canCancel: status !== "FINISHED" && status !== "CANCELLED",
    // Finalizar manualmente e excecao: so durante a competicao.
    canFinish: status === "IN_PROGRESS" || status === "CALCULATING_RESULTS",
    canRecalculate: status === "FINISHED" || status === "CALCULATING_RESULTS",
    canViewAnswers: status === "FINISHED",
  };
}
