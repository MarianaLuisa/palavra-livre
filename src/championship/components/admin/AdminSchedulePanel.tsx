import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CHAMPIONSHIP_TIMEZONE } from "../../config";
import { formatDateTime } from "../../format";
import { fromZonedDateTime, toZonedDateTime } from "../../timezone";
import type { AdminChampionship, ChampionshipSchedule } from "../../types";

type AdminSchedulePanelProps = {
  championship: AdminChampionship;
  editable: boolean;
  saving: boolean;
  onSave: (schedule: ChampionshipSchedule) => void;
};

type FormState = {
  date: string;
  opensTime: string;
  closesTime: string;
  startsTime: string;
};

function buildFormState(championship: AdminChampionship): FormState {
  const opens = toZonedDateTime(championship.registrationOpensAt, CHAMPIONSHIP_TIMEZONE);
  const closes = toZonedDateTime(championship.registrationClosesAt, CHAMPIONSHIP_TIMEZONE);
  const starts = toZonedDateTime(championship.startsAt, CHAMPIONSHIP_TIMEZONE);

  return {
    // A data de referência é a do campeonato, não a do instante de abertura:
    // inscrições podem abrir no dia anterior sem confundir o formulário.
    date: starts?.date ?? championship.championshipDate,
    opensTime: opens?.time ?? "09:00",
    closesTime: closes?.time ?? "19:55",
    startsTime: starts?.time ?? "20:00",
  };
}

/**
 * Edição dos horários.
 *
 * A pessoa digita hora local de São Paulo; o componente converte para
 * instantes absolutos (ISO 8601) antes de enviar. Nenhuma conversão manual
 * de UTC acontece aqui nem no backend.
 */
export function AdminSchedulePanel({
  championship,
  editable,
  saving,
  onSave,
}: AdminSchedulePanelProps) {
  const initialState = useMemo(() => buildFormState(championship), [championship]);
  const [form, setForm] = useState<FormState>(initialState);
  const [localError, setLocalError] = useState<string | null>(null);

  // Recarrega quando o servidor devolve horários diferentes.
  useEffect(() => {
    setForm(initialState);
    setLocalError(null);
  }, [initialState]);

  const preview = useMemo(() => {
    try {
      return {
        opens: fromZonedDateTime(form.date, form.opensTime, CHAMPIONSHIP_TIMEZONE),
        closes: fromZonedDateTime(form.date, form.closesTime, CHAMPIONSHIP_TIMEZONE),
        starts: fromZonedDateTime(form.date, form.startsTime, CHAMPIONSHIP_TIMEZONE),
      };
    } catch {
      return null;
    }
  }, [form]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setLocalError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (preview === null) {
      setLocalError("Preencha data e horários válidos.");
      return;
    }

    const opens = Date.parse(preview.opens);
    const closes = Date.parse(preview.closes);
    const starts = Date.parse(preview.starts);

    if (opens >= closes) {
      setLocalError("A abertura das inscrições precisa ser antes do fechamento.");
      return;
    }

    if (closes > starts) {
      setLocalError("O fechamento das inscrições precisa ser antes ou junto do início.");
      return;
    }

    onSave({
      registrationOpensAt: preview.opens,
      registrationClosesAt: preview.closes,
      startsAt: preview.starts,
    });
  }

  return (
    <section className="admin-section" aria-labelledby="admin-schedule-title">
      <h2 id="admin-schedule-title">Horários</h2>
      <p className="admin-section-hint">
        Tudo em horário de Brasília ({CHAMPIONSHIP_TIMEZONE}). O horário oficial é sempre o
        do servidor.
      </p>

      {!editable ? (
        <div className="panel-notice">
          Os horários ficam bloqueados depois que o campeonato começa. Valores atuais:
          <br />
          Abertura {formatDateTime(championship.registrationOpensAt)} · Fechamento{" "}
          {formatDateTime(championship.registrationClosesAt)} · Início{" "}
          {formatDateTime(championship.startsAt)}
        </div>
      ) : (
        <form className="admin-schedule-form" onSubmit={handleSubmit}>
          <div className="admin-field">
            <label htmlFor="schedule-date">Data</label>
            <input
              id="schedule-date"
              className="text-input"
              type="date"
              value={form.date}
              disabled={saving}
              onChange={(event) => updateField("date", event.target.value)}
            />
          </div>

          <div className="admin-field">
            <label htmlFor="schedule-opens">Abertura das inscrições</label>
            <input
              id="schedule-opens"
              className="text-input"
              type="time"
              value={form.opensTime}
              disabled={saving}
              onChange={(event) => updateField("opensTime", event.target.value)}
            />
          </div>

          <div className="admin-field">
            <label htmlFor="schedule-closes">Fechamento das inscrições</label>
            <input
              id="schedule-closes"
              className="text-input"
              type="time"
              value={form.closesTime}
              disabled={saving}
              onChange={(event) => updateField("closesTime", event.target.value)}
            />
          </div>

          <div className="admin-field">
            <label htmlFor="schedule-starts">Início do campeonato</label>
            <input
              id="schedule-starts"
              className="text-input"
              type="time"
              value={form.startsTime}
              disabled={saving}
              onChange={(event) => updateField("startsTime", event.target.value)}
            />
          </div>

          {localError !== null ? (
            <p className="panel-error admin-field-full" role="alert">
              {localError}
            </p>
          ) : null}

          <div className="admin-field-full">
            <button className="secondary-button" type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar horários"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
