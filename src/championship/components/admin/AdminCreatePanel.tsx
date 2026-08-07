import { useState, type FormEvent } from "react";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_TIMEZONE } from "../../config";
import { fromZonedDateTime } from "../../timezone";
import type { CreateChampionshipInput } from "../../service";

type AdminCreatePanelProps = {
  /** Data de hoje no fuso do campeonato, vinda do servidor. */
  today: string;
  creating: boolean;
  onCreate: (input: CreateChampionshipInput) => void;
};

/** Horários padrão do projeto. */
const DEFAULT_TIMES = {
  opens: "09:00",
  closes: "19:55",
  starts: "20:00",
} as const;

export function AdminCreatePanel({ today, creating, onCreate }: AdminCreatePanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(today);
  const [opensTime, setOpensTime] = useState<string>(DEFAULT_TIMES.opens);
  const [closesTime, setClosesTime] = useState<string>(DEFAULT_TIMES.closes);
  const [startsTime, setStartsTime] = useState<string>(DEFAULT_TIMES.starts);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleCreateWithDefaults() {
    // Sem parâmetros: o backend aplica os padrões dele.
    onCreate({});
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    let opens: string;
    let closes: string;
    let starts: string;

    try {
      opens = fromZonedDateTime(date, opensTime, CHAMPIONSHIP_TIMEZONE);
      closes = fromZonedDateTime(date, closesTime, CHAMPIONSHIP_TIMEZONE);
      starts = fromZonedDateTime(date, startsTime, CHAMPIONSHIP_TIMEZONE);
    } catch {
      setLocalError("Preencha data e horários válidos.");
      return;
    }

    if (Date.parse(opens) >= Date.parse(closes)) {
      setLocalError("A abertura das inscrições precisa ser antes do fechamento.");
      return;
    }

    if (Date.parse(closes) > Date.parse(starts)) {
      setLocalError("O fechamento das inscrições precisa ser antes ou junto do início.");
      return;
    }

    onCreate({
      championshipDate: date,
      registrationOpensAt: opens,
      registrationClosesAt: closes,
      startsAt: starts,
    });
  }

  return (
    <section className="championship-panel" aria-labelledby="admin-create-title">
      <header className="panel-header">
        <p className="eyebrow">{CHAMPIONSHIP_BRAND.name} — Administração</p>
        <h1 id="admin-create-title">Nenhum campeonato criado para hoje.</h1>
        <p className="panel-subtitle">
          Ao criar, o servidor gera as quatro modalidades e sorteia as 13 palavras.
        </p>
      </header>

      <div className="panel-actions wrap">
        <button
          className="primary-button"
          type="button"
          onClick={handleCreateWithDefaults}
          disabled={creating}
        >
          {creating ? "Criando..." : "Criar com horários padrão"}
        </button>
        <button
          className="ghost-button"
          type="button"
          onClick={() => setShowForm((current) => !current)}
          disabled={creating}
          aria-expanded={showForm}
        >
          {showForm ? "Ocultar horários" : "Escolher horários"}
        </button>
      </div>

      <p className="admin-section-hint">
        Padrão: inscrições das {DEFAULT_TIMES.opens} às {DEFAULT_TIMES.closes} e início às{" "}
        {DEFAULT_TIMES.starts}, horário de Brasília.
      </p>

      {showForm ? (
        <form className="admin-schedule-form" onSubmit={handleSubmit}>
          <div className="admin-field">
            <label htmlFor="create-date">Data</label>
            <input
              id="create-date"
              className="text-input"
              type="date"
              value={date}
              disabled={creating}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div className="admin-field">
            <label htmlFor="create-opens">Abertura das inscrições</label>
            <input
              id="create-opens"
              className="text-input"
              type="time"
              value={opensTime}
              disabled={creating}
              onChange={(event) => setOpensTime(event.target.value)}
            />
          </div>

          <div className="admin-field">
            <label htmlFor="create-closes">Fechamento das inscrições</label>
            <input
              id="create-closes"
              className="text-input"
              type="time"
              value={closesTime}
              disabled={creating}
              onChange={(event) => setClosesTime(event.target.value)}
            />
          </div>

          <div className="admin-field">
            <label htmlFor="create-starts">Início do campeonato</label>
            <input
              id="create-starts"
              className="text-input"
              type="time"
              value={startsTime}
              disabled={creating}
              onChange={(event) => setStartsTime(event.target.value)}
            />
          </div>

          {localError !== null ? (
            <p className="panel-error admin-field-full" role="alert">
              {localError}
            </p>
          ) : null}

          <div className="admin-field-full">
            <button className="primary-button" type="submit" disabled={creating}>
              {creating ? "Criando..." : "Criar campeonato"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
