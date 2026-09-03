import { useState, type FormEvent } from "react";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_STATUS_LABEL } from "../config";
import { formatDate, formatTime } from "../format";
import { getBrazilCurrentDate } from "../timezone";
import type { ChampionshipSummary } from "../types";

type JoinPanelProps = {
  championship: ChampionshipSummary;
  suggestedName: string;
  /**
   * Nome de usuário da conta permanente.
   * Quando presente, a inscrição não pede o nome de novo: usa a conta.
   */
  accountUsername?: string | null;
  serverNow: string;
  busy: boolean;
  onRegister: (displayName: string) => void;
};

export function JoinPanel({
  championship,
  suggestedName,
  accountUsername = null,
  serverNow,
  busy,
  onRegister,
}: JoinPanelProps) {
  const [displayName, setDisplayName] = useState(accountUsername ?? suggestedName);
  const usesAccountName = accountUsername !== null && accountUsername.length >= 2;
  const serverTime = Number.isNaN(Date.parse(serverNow)) ? Date.now() : Date.parse(serverNow);
  let registrationClosesAt = Number.isNaN(Date.parse(championship.registrationClosesAt))
    ? Number.MAX_SAFE_INTEGER
    : Date.parse(championship.registrationClosesAt);

  const todayDate = getBrazilCurrentDate(serverTime);
  const isToday = championship.championshipDate === todayDate;

  // Se a data de fechamento no banco foi configurada como início do dia (00:00)
  // em vez de fim do dia, ajusta defensivamente para 23:59:59 do dia de hoje.
  const todayStart = Date.parse(`${todayDate}T00:00:00-03:00`);
  const todayEnd = Date.parse(`${todayDate}T23:59:59-03:00`);
  if (isToday && registrationClosesAt <= todayStart + 60_000) {
    registrationClosesAt = todayEnd;
  }

  const isFinished = championship.status === "FINISHED" || championship.status === "CANCELLED";
  const isPastCloses = serverTime > registrationClosesAt;
  const canJoinToday = !isFinished && !isPastCloses && (championship.status === "IN_PROGRESS" || isToday);
  const trimmedName = displayName.trim();
  const nameIsValid = trimmedName.length >= 2 && trimmedName.length <= 24;

  const rawClosesTime = formatTime(championship.registrationClosesAt);
  const closesTimeFormatted = rawClosesTime === "00:00" ? "23:59" : rawClosesTime;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (canJoinToday && nameIsValid && !busy) {
      onRegister(trimmedName);
    }
  }

  return (
    <section className="championship-panel" aria-labelledby="join-title">
      <header className="panel-header">
        <h1 id="join-title">{CHAMPIONSHIP_BRAND.name}</h1>
        <p className="panel-subtitle">
          Rodada diária de {formatDate(championship.championshipDate)} · disponível até{" "}
          {closesTimeFormatted}
        </p>
        <span className={`status-chip status-${championship.status.toLowerCase()}`}>
          {CHAMPIONSHIP_STATUS_LABEL[championship.status] ?? championship.status}
        </span>
      </header>

      <ul className="panel-facts">
        <li>Todos os {CHAMPIONSHIP_BRAND.participantLabelPlural} recebem exatamente as mesmas palavras.</li>
        <li>Quatro modalidades em sequência: Simples, Dueto, Quarteto e Sexteto.</li>
        <li>13 palavras no total. Cada palavra descoberta vale 100 pontos.</li>
        <li>Concluir todas as palavras de uma modalidade rende 10 pontos por tentativa restante.</li>
        <li>Você pode jogar a qualquer hora do dia, uma vez por rodada diária.</li>
      </ul>

      {canJoinToday ? (
        <form className="join-form" onSubmit={handleSubmit}>
          {usesAccountName ? (
            // Conta permanente: não pedimos o nome de novo.
            <div className="join-account">
              <span>Você entra como</span>
              <strong>{accountUsername}</strong>
            </div>
          ) : null}
          <label
            htmlFor="display-name"
            className={usesAccountName ? "visually-hidden" : undefined}
          >
            Seu nome no {CHAMPIONSHIP_BRAND.eventLabel}
          </label>
          <input
            id="display-name"
            className="text-input"
            type="text"
            value={displayName}
            maxLength={24}
            autoComplete="nickname"
            placeholder="Como você quer aparecer no ranking"
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={busy || usesAccountName}
            readOnly={usesAccountName}
            hidden={usesAccountName}
            aria-describedby="display-name-hint"
          />
          <small id="display-name-hint" hidden={usesAccountName}>
            Entre 2 e 24 caracteres. Não pode repetir o nome de outro participante do mesmo dia.
          </small>
          <button className="primary-button" type="submit" disabled={!nameIsValid || busy}>
            {busy ? "Entrando..." : "Jogar campeonato"}
          </button>
        </form>
      ) : (
        <div className="panel-notice">
          {isFinished || isPastCloses ? (
            <p>A rodada diária de hoje já foi encerrada. O resultado do dia será publicado aqui.</p>
          ) : (
            <p>
              A próxima rodada diária fica disponível em {formatDate(championship.startsAt)}.
            </p>
          )}
          <p>Enquanto isso, o Jogo Livre continua disponível com partidas ilimitadas.</p>
        </div>
      )}

      <p className="panel-footnote">
        {championship.participantCount ?? 0} {CHAMPIONSHIP_BRAND.participantLabelPlural} participando hoje.
      </p>
    </section>
  );
}
