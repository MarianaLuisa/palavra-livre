import { useState, type FormEvent } from "react";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_STATUS_LABEL } from "../config";
import { formatDate, formatTime } from "../format";
import type { ChampionshipSummary } from "../types";

type JoinPanelProps = {
  championship: ChampionshipSummary;
  suggestedName: string;
  busy: boolean;
  onRegister: (displayName: string) => void;
};

export function JoinPanel({
  championship,
  suggestedName,
  busy,
  onRegister,
}: JoinPanelProps) {
  const [displayName, setDisplayName] = useState(suggestedName);
  const registrationOpen = championship.status === "REGISTRATION_OPEN";
  const trimmedName = displayName.trim();
  const nameIsValid = trimmedName.length >= 2 && trimmedName.length <= 24;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (nameIsValid && !busy) {
      onRegister(trimmedName);
    }
  }

  return (
    <section className="championship-panel" aria-labelledby="join-title">
      <header className="panel-header">
        <h1 id="join-title">{CHAMPIONSHIP_BRAND.name}</h1>
        <p className="panel-subtitle">
          {formatDate(championship.championshipDate)} · inicio as{" "}
          {formatTime(championship.startsAt)}
        </p>
        <span className={`status-chip status-${championship.status.toLowerCase()}`}>
          {CHAMPIONSHIP_STATUS_LABEL[championship.status] ?? championship.status}
        </span>
      </header>

      <ul className="panel-facts">
        <li>Todos os {CHAMPIONSHIP_BRAND.participantLabelPlural} recebem exatamente as mesmas palavras.</li>
        <li>Quatro modalidades em sequencia: Simples, Dueto, Quarteto e Sexteto.</li>
        <li>13 palavras no total. Cada palavra descoberta vale 100 pontos.</li>
        <li>Concluir todas as palavras de uma modalidade rende 10 pontos por tentativa restante.</li>
        <li>Uma participacao por pessoa e por dia.</li>
      </ul>

      {registrationOpen ? (
        <form className="join-form" onSubmit={handleSubmit}>
          <label htmlFor="display-name">Seu nome no {CHAMPIONSHIP_BRAND.eventLabel}</label>
          <input
            id="display-name"
            className="text-input"
            type="text"
            value={displayName}
            maxLength={24}
            autoComplete="nickname"
            placeholder="Como voce quer aparecer no ranking"
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={busy}
            aria-describedby="display-name-hint"
          />
          <small id="display-name-hint">
            Entre 2 e 24 caracteres. Nao pode repetir o nome de outro participante do mesmo dia.
          </small>
          <button className="primary-button" type="submit" disabled={!nameIsValid || busy}>
            {busy ? "Inscrevendo..." : "Confirmar inscricao"}
          </button>
        </form>
      ) : (
        <div className="panel-notice">
          <p>
            As inscricoes abrem em {formatDate(championship.registrationOpensAt)} as{" "}
            {formatTime(championship.registrationOpensAt)} e fecham as{" "}
            {formatTime(championship.registrationClosesAt)}.
          </p>
          <p>
            Enquanto isso, o Jogo Livre continua disponivel com partidas ilimitadas.
          </p>
        </div>
      )}

      <p className="panel-footnote">
        {championship.participantCount} {CHAMPIONSHIP_BRAND.participantLabelPlural} inscritos ate agora.
      </p>
    </section>
  );
}
