import {
  CHAMPIONSHIP_NEXT_STEP_LABEL,
  CHAMPIONSHIP_STATUS_LABEL,
} from "../../config";
import { formatDate, formatDateTime, formatTime } from "../../format";
import type { AdminChampionship, AdminCounters } from "../../types";

type AdminStatusCardProps = {
  championship: AdminChampionship;
  counters: AdminCounters;
  isToday: boolean;
  canStartNow: boolean;
  startingNow: boolean;
  onStartNow: () => void;
};

const LONG_DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function formatLongDate(isoDate: string): string {
  // championship_date chega como AAAA-MM-DD, sem fuso.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);

  if (match === null) {
    return formatDate(isoDate);
  }

  const [, year, month, day] = match;
  return LONG_DATE.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)));
}

/** Cabeçalho do painel: identidade, status, próxima etapa e o botão principal. */
export function AdminStatusCard({
  championship,
  counters,
  isToday,
  canStartNow,
  startingNow,
  onStartNow,
}: AdminStatusCardProps) {
  const statusLabel = CHAMPIONSHIP_STATUS_LABEL[championship.status] ?? championship.status;
  const nextStep = CHAMPIONSHIP_NEXT_STEP_LABEL[championship.status] ?? "—";
  const answersReady = championship.answerCount >= championship.expectedAnswerCount;

  return (
    <section className="admin-hero" aria-labelledby="admin-hero-title">
      <header className="admin-hero-header">
        <div>
          <p className="eyebrow">Campeonato Diário — Administração</p>
          <h1 id="admin-hero-title">{formatLongDate(championship.championshipDate)}</h1>
        </div>
        <div className="admin-hero-badges">
          <span className={`status-chip status-${championship.status.toLowerCase()}`}>
            {statusLabel}
          </span>
          <span className={championship.isOfficial ? "tag-chip official" : "tag-chip test"}>
            {championship.isOfficial ? "Oficial" : "Teste"}
          </span>
          {!isToday ? <span className="tag-chip warning">Não é o campeonato de hoje</span> : null}
        </div>
      </header>

      <p className="admin-next-step">
        <span>Próxima etapa</span>
        <strong>{nextStep}</strong>
      </p>

      <dl className="admin-hero-facts">
        <div>
          <dt>Início programado</dt>
          <dd>{formatTime(championship.startsAt)}</dd>
        </div>
        <div>
          <dt>Inscrições encerram</dt>
          <dd>{formatTime(championship.registrationClosesAt)}</dd>
        </div>
        <div>
          <dt>Inscritos</dt>
          <dd>{counters.registered}</dd>
        </div>
        <div>
          <dt>Palavras sorteadas</dt>
          <dd className={answersReady ? undefined : "value-warning"}>
            {championship.answerCount}/{championship.expectedAnswerCount}
          </dd>
        </div>
      </dl>

      {canStartNow ? (
        <button
          className="start-now-button"
          type="button"
          onClick={onStartNow}
          disabled={startingNow}
        >
          {startingNow ? "Começando campeonato..." : "Começar agora"}
        </button>
      ) : (
        <p className="admin-start-unavailable">
          {championship.status === "IN_PROGRESS"
            ? `Campeonato em andamento desde ${formatDateTime(championship.actualStartedAt ?? championship.startsAt)}.`
            : championship.status === "FINISHED"
              ? `Campeonato finalizado em ${formatDateTime(championship.finishedAt)}.`
              : championship.status === "CANCELLED"
                ? "Campeonato cancelado."
                : "Este campeonato não pode ser iniciado."}
        </p>
      )}
    </section>
  );
}
