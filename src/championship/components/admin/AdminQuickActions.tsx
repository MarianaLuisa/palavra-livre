import type { AdminActionAvailability } from "../../adminActions";
import type { AdminActionId } from "../../useAdminChampionship";

type AdminQuickActionsProps = {
  availability: AdminActionAvailability;
  pendingAction: AdminActionId | null;
  onOpenRegistration: () => void;
  onCloseRegistration: () => void;
  onStartIn: (minutes: number, action: AdminActionId) => void;
  onRedrawWords: () => void;
};

/**
 * Atalhos para testar o fluxo sem esperar o horário programado.
 *
 * Todos alteram horários no servidor — nenhum muda status direto, porque
 * o status é derivado do relógio do banco.
 */
export function AdminQuickActions({
  availability,
  pendingAction,
  onOpenRegistration,
  onCloseRegistration,
  onStartIn,
  onRedrawWords,
}: AdminQuickActionsProps) {
  const busy = pendingAction !== null;

  return (
    <section className="admin-section" aria-labelledby="admin-quick-title">
      <h2 id="admin-quick-title">Ações rápidas</h2>
      <p className="admin-section-hint">
        Atalhos de teste. Cada botão ajusta os horários no servidor e o status é
        recalculado a partir deles.
      </p>

      <div className="admin-quick-grid">
        <button
          className="ghost-button"
          type="button"
          disabled={busy || !availability.canOpenRegistration}
          onClick={onOpenRegistration}
        >
          {pendingAction === "openRegistration" ? "Abrindo..." : "Abrir inscrições agora"}
        </button>

        <button
          className="ghost-button"
          type="button"
          disabled={busy || !availability.canCloseRegistration}
          onClick={onCloseRegistration}
        >
          {pendingAction === "closeRegistration" ? "Fechando..." : "Fechar inscrições agora"}
        </button>

        <button
          className="ghost-button"
          type="button"
          disabled={busy || !availability.canScheduleStartIn}
          onClick={() => onStartIn(5, "startIn5")}
        >
          {pendingAction === "startIn5" ? "Programando..." : "Iniciar em 5 minutos"}
        </button>

        <button
          className="ghost-button"
          type="button"
          disabled={busy || !availability.canScheduleStartIn}
          onClick={() => onStartIn(10, "startIn10")}
        >
          {pendingAction === "startIn10" ? "Programando..." : "Iniciar em 10 minutos"}
        </button>

        <button
          className="ghost-button"
          type="button"
          disabled={busy || !availability.canRedrawWords}
          onClick={onRedrawWords}
          title="Sorteia 13 novas palavras no servidor. Bloqueado depois do início."
        >
          {pendingAction === "redraw" ? "Sorteando..." : "Sortear novas palavras"}
        </button>
      </div>
    </section>
  );
}
