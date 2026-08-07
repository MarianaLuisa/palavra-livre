import { useState, type FormEvent } from "react";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_STATUS_LABEL } from "../config";
import { formatDate, formatTime } from "../format";
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
  const serverTime = Date.parse(serverNow);
  const registrationOpensAt = Date.parse(championship.registrationOpensAt);
  const registrationClosesAt = Date.parse(championship.registrationClosesAt);
  const startsAt = Date.parse(championship.startsAt);
  const registrationOpen =
    championship.status === "REGISTRATION_OPEN" &&
    serverTime >= registrationOpensAt &&
    serverTime < registrationClosesAt;
  const championshipStarted =
    championship.status === "IN_PROGRESS" ||
    championship.status === "CALCULATING_RESULTS" ||
    championship.status === "FINISHED" ||
    serverTime >= startsAt;
  const trimmedName = displayName.trim();
  const nameIsValid = trimmedName.length >= 2 && trimmedName.length <= 24;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (registrationOpen && nameIsValid && !busy) {
      onRegister(trimmedName);
    }
  }

  return (
    <section className="championship-panel" aria-labelledby="join-title">
      <header className="panel-header">
        <h1 id="join-title">{CHAMPIONSHIP_BRAND.name}</h1>
        <p className="panel-subtitle">
          {formatDate(championship.championshipDate)} · início às{" "}
          {formatTime(championship.startsAt)}
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
        <li>Uma participação por pessoa e por dia.</li>
      </ul>

      {registrationOpen ? (
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
            {busy ? "Inscrevendo..." : "Confirmar inscrição"}
          </button>
        </form>
      ) : (
        <div className="panel-notice">
          {championshipStarted || championship.status === "WAITING" ? (
            <p>As inscrições deste {CHAMPIONSHIP_BRAND.eventLabel} já foram encerradas.</p>
          ) : (
            <p>
              As inscrições abrem em {formatDate(championship.registrationOpensAt)} às{" "}
              {formatTime(championship.registrationOpensAt)} e fecham às{" "}
              {formatTime(championship.registrationClosesAt)}.
            </p>
          )}
          <p>Enquanto isso, o Jogo Livre continua disponível com partidas ilimitadas.</p>
        </div>
      )}

      <p className="panel-footnote">
        {championship.participantCount} {CHAMPIONSHIP_BRAND.participantLabelPlural} inscritos até agora.
      </p>
    </section>
  );
}
