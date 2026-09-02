import { Countdown } from "../components/Countdown";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_STATUS_LABEL, PARTICIPATION_STATUS_LABEL } from "../config";
import { formatDate, formatTime } from "../format";
import type { ChampionshipSummary, ParticipantSummary } from "../types";
import { useCountdown } from "../useChampionship";

type LobbyPanelProps = {
  championship: ChampionshipSummary;
  participant: ParticipantSummary;
  serverNow: string;
  busy: boolean;
  onCancelRegistration: () => void;
  onRefresh: () => void;
};

export function LobbyPanel({
  championship,
  participant,
  serverNow,
  busy,
  onCancelRegistration,
  onRefresh,
}: LobbyPanelProps) {
  const remainingMs = useCountdown(championship.startsAt, serverNow);
  const canCancel =
    championship.status === "REGISTRATION_OPEN" || championship.status === "WAITING";

  return (
    <section className="championship-panel" aria-labelledby="lobby-title">
      <header className="panel-header">
        <h1 id="lobby-title">Sala de espera</h1>
        <p className="panel-subtitle">
          {CHAMPIONSHIP_BRAND.name} · {formatDate(championship.championshipDate)}
        </p>
        <span className={`status-chip status-${championship.status.toLowerCase()}`}>
          {CHAMPIONSHIP_STATUS_LABEL[championship.status] ?? championship.status}
        </span>
      </header>

      <Countdown
        remainingMs={remainingMs}
        label={`O ${CHAMPIONSHIP_BRAND.eventLabel} começa em`}
        hint={`Início às ${formatTime(championship.startsAt)} (horário de Brasília)`}
      />

      <dl className="panel-grid">
        <div>
          <dt>Participante</dt>
          <dd>{participant.displayName}</dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>{PARTICIPATION_STATUS_LABEL[participant.status] ?? participant.status}</dd>
        </div>
        <div>
          <dt>Inscritos</dt>
          <dd>{championship.participantCount}</dd>
        </div>
        <div>
          <dt>Inscrições fecham</dt>
          <dd>{formatTime(championship.registrationClosesAt)}</dd>
        </div>
      </dl>

      <ul className="panel-facts">
        <li>Todos vão receber exatamente as mesmas palavras, ao mesmo tempo.</li>
        <li>A primeira modalidade abre automaticamente quando o servidor confirmar o início.</li>
        <li>Se você sair e voltar, sua participação continua de onde parou.</li>
      </ul>

      <div className="panel-actions">
        <button className="secondary-button" type="button" onClick={onRefresh} disabled={busy}>
          Atualizar situação
        </button>
        {canCancel ? (
          <button
            className="ghost-button"
            type="button"
            onClick={onCancelRegistration}
            disabled={busy}
          >
            Cancelar minha inscrição
          </button>
        ) : null}
      </div>

      <p className="panel-footnote">
        A contagem acima é apenas visual. O início real é confirmado pelo servidor.
      </p>
    </section>
  );
}
