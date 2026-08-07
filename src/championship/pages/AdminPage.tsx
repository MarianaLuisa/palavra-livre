import { useState } from "react";
import { getAdminActionAvailability } from "../adminActions";
import { AdminCreatePanel } from "../components/admin/AdminCreatePanel";
import { AdminPlayersPanel } from "../components/admin/AdminPlayersPanel";
import { AdminParticipantsTable } from "../components/admin/AdminParticipantsTable";
import { AdminQuickActions } from "../components/admin/AdminQuickActions";
import { AdminResultsPanel } from "../components/admin/AdminResultsPanel";
import { AdminRoundsPanel } from "../components/admin/AdminRoundsPanel";
import { AdminSchedulePanel } from "../components/admin/AdminSchedulePanel";
import { AdminStatusCard } from "../components/admin/AdminStatusCard";
import { ConfirmDialog } from "../components/admin/ConfirmDialog";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_ROUTES } from "../config";
import { formatDateTime } from "../format";
import { useAdminChampionship } from "../useAdminChampionship";
import { Link } from "../../router/router";

type DialogKind = "startNow" | "cancel" | "finish" | null;

/**
 * Painel administrativo do Campeonato Diário.
 *
 * Toda ação daqui chama uma RPC que valida auth.uid() contra
 * championship_admins. Esconder botões é só ergonomia: a autorização
 * de verdade acontece no banco.
 */
export function AdminPage() {
  const admin = useAdminChampionship();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [tab, setTab] = useState<"championship" | "players">("championship");

  if (!admin.configured) {
    return (
      <section className="championship-panel">
        <header className="panel-header">
          <h1>{CHAMPIONSHIP_BRAND.name} — Administração</h1>
        </header>
        <p className="panel-notice">
          Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> para
          habilitar a administração.
        </p>
        <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.home}>
          Voltar ao início
        </Link>
      </section>
    );
  }

  if (admin.loading && admin.overview === null) {
    return (
      <section className="championship-panel">
        <p className="loading-state">Carregando o painel administrativo...</p>
      </section>
    );
  }

  if (admin.forbidden) {
    return (
      <section className="championship-panel">
        <header className="panel-header">
          <h1>Acesso restrito</h1>
        </header>
        <p className="panel-notice">
          Esta área é exclusiva de administradores do {CHAMPIONSHIP_BRAND.eventLabel}. Se você
          deveria ter acesso, peça para incluírem seu usuário na tabela{" "}
          <code>championship_admins</code>.
        </p>
        <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.championship}>
          Voltar ao {CHAMPIONSHIP_BRAND.eventLabel}
        </Link>
      </section>
    );
  }

  const overview = admin.overview;
  const championship = overview?.championship ?? null;
  const availability = getAdminActionAvailability(championship?.status ?? null);
  const busy = admin.pendingAction !== null;

  const messages = (
    <>
      {admin.error !== null ? (
        <p className="panel-error" role="alert">
          {admin.error}
        </p>
      ) : null}
      {admin.feedback !== null ? (
        <p className="admin-feedback" role="status">
          {admin.feedback}
        </p>
      ) : null}
    </>
  );

  // Sem campeonato, ou o mais recente não é o de hoje: oferece a criação.
  if (overview !== null && (championship === null || !overview.hasChampionshipToday)) {
    return (
      <>
        {messages}
        <AdminCreatePanel
          today={overview.today}
          creating={admin.pendingAction === "create"}
          onCreate={(input) => void admin.createChampionship(input)}
        />
        {championship !== null ? (
          <section className="admin-section admin-previous">
            <h2>Campeonato mais recente</h2>
            <p className="admin-section-hint">
              {formatDateTime(championship.startsAt)} · {championship.status}
            </p>
            <AdminParticipantsTable
              participants={overview.participants}
              showRanking={championship.status === "FINISHED"}
            />
          </section>
        ) : null}
      </>
    );
  }

  if (overview === null || championship === null) {
    return (
      <section className="championship-panel">
        <p className="panel-error" role="alert">
          {admin.error ?? "Não foi possível carregar o painel."}
        </p>
        <button className="secondary-button" type="button" onClick={() => void admin.refresh()}>
          Tentar novamente
        </button>
      </section>
    );
  }

  const tabs = (
    <nav className="period-tabs admin-tabs" aria-label="Secoes da administracao">
      <button
        type="button"
        className={tab === "championship" ? "period-tab active" : "period-tab"}
        aria-pressed={tab === "championship"}
        onClick={() => setTab("championship")}
      >
        Campeonato
      </button>
      <button
        type="button"
        className={tab === "players" ? "period-tab active" : "period-tab"}
        aria-pressed={tab === "players"}
        onClick={() => setTab("players")}
      >
        Jogadores
      </button>
    </nav>
  );

  if (tab === "players") {
    return (
      <div className="admin-layout">
        {tabs}
        <AdminPlayersPanel />
      </div>
    );
  }

  return (
    <div className="admin-layout">
      {tabs}
      <AdminStatusCard
        championship={championship}
        counters={overview.counters}
        isToday={overview.isToday}
        canStartNow={availability.canStartNow}
        startingNow={admin.pendingAction === "startNow"}
        onStartNow={() => setDialog("startNow")}
      />

      {messages}

      <section className="admin-section" aria-labelledby="admin-counters-title">
        <h2 id="admin-counters-title">Participantes</h2>
        <dl className="panel-grid">
          <div>
            <dt>Inscritos</dt>
            <dd>{overview.counters.registered}</dd>
          </div>
          <div>
            <dt>Começaram</dt>
            <dd>{overview.counters.started}</dd>
          </div>
          <div>
            <dt>Jogando</dt>
            <dd>{overview.counters.playing}</dd>
          </div>
          <div>
            <dt>Finalizados</dt>
            <dd>{overview.counters.finished}</dd>
          </div>
          <div>
            <dt>Abandonaram</dt>
            <dd>{overview.counters.abandoned}</dd>
          </div>
        </dl>
      </section>

      <AdminSchedulePanel
        championship={championship}
        editable={availability.canEditSchedule}
        saving={admin.pendingAction === "saveSchedule"}
        onSave={(schedule) => void admin.saveSchedule(schedule)}
      />

      <AdminQuickActions
        availability={availability}
        pendingAction={admin.pendingAction}
        onOpenRegistration={() => void admin.openRegistrationNow()}
        onCloseRegistration={() => void admin.closeRegistrationNow()}
        onStartIn={(minutes, action) => void admin.startIn(minutes, action)}
        onRedrawWords={() => void admin.redrawWords()}
      />

      <AdminRoundsPanel rounds={overview.rounds} championshipStatus={championship.status} />

      <AdminParticipantsTable
        participants={overview.participants}
        showRanking={championship.status === "FINISHED"}
      />

      {championship.status === "FINISHED" ? (
        <AdminResultsPanel
          participants={overview.participants}
          finishedAt={championship.finishedAt}
          answers={admin.answers}
          loadingAnswers={admin.pendingAction === "answers"}
          onLoadAnswers={() => void admin.loadAnswers()}
        />
      ) : null}

      <section className="admin-section admin-danger-zone" aria-labelledby="admin-danger-title">
        <h2 id="admin-danger-title">Ações administrativas</h2>
        <p className="admin-section-hint">
          Use com cuidado. O encerramento normal acontece sozinho quando todos concluem.
        </p>
        <div className="panel-actions wrap">
          {availability.canFinish ? (
            <button
              className="ghost-button"
              type="button"
              disabled={busy}
              onClick={() => setDialog("finish")}
            >
              Finalizar campeonato
            </button>
          ) : null}
          {availability.canRecalculate ? (
            <button
              className="ghost-button"
              type="button"
              disabled={busy}
              onClick={() => void admin.recalculateRanking()}
            >
              {admin.pendingAction === "recalculate"
                ? "Recalculando..."
                : "Recalcular classificação"}
            </button>
          ) : null}
          {availability.canCancel ? (
            <button
              className="danger-button"
              type="button"
              disabled={busy}
              onClick={() => setDialog("cancel")}
            >
              Cancelar campeonato
            </button>
          ) : null}
        </div>
      </section>

      <p className="admin-footer-note">
        Identificador: <code>{championship.id}</code> · horário do servidor:{" "}
        {formatDateTime(overview.serverNow)} · base de respostas: {overview.wordPoolSize ?? "—"}{" "}
        palavras
      </p>

      <ConfirmDialog
        open={dialog === "startNow"}
        title={`Iniciar o ${CHAMPIONSHIP_BRAND.name} agora?`}
        description="As inscrições serão encerradas imediatamente e os participantes inscritos poderão começar a jogar."
        warning="O horário programado será antecipado para agora. As palavras já sorteadas e as inscrições são preservadas."
        confirmLabel="Começar agora"
        busy={admin.pendingAction === "startNow"}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          void admin.startNow();
        }}
      />

      <ConfirmDialog
        open={dialog === "cancel"}
        title="Cancelar o campeonato?"
        description="O campeonato será cancelado e não poderá ser iniciado normalmente."
        warning="Nenhum dado é apagado: participantes, tentativas e respostas continuam no histórico."
        confirmLabel="Cancelar campeonato"
        cancelLabel="Voltar"
        danger
        busy={admin.pendingAction === "cancel"}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          void admin.cancelChampionship();
        }}
      />

      <ConfirmDialog
        open={dialog === "finish"}
        title="Finalizar o campeonato agora?"
        description="As modalidades em aberto serão encerradas e a classificação será consolidada imediatamente."
        warning="Use apenas em situação excepcional. Quem ainda estiver jogando será marcado como abandono."
        confirmLabel="Finalizar campeonato"
        cancelLabel="Voltar"
        danger
        busy={admin.pendingAction === "finish"}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          void admin.finishChampionship();
        }}
      />
    </div>
  );
}
