import { useState } from "react";
import { CHAMPIONSHIP_BRAND } from "../../config";
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
  const [date] = useState(today);

  void creating;
  void onCreate;
  void date;

  return (
    <section className="championship-panel" aria-labelledby="admin-create-title">
      <header className="panel-header">
        <p className="eyebrow">{CHAMPIONSHIP_BRAND.name} — Administração</p>
        <h1 id="admin-create-title">Calendário do Campeonato Norte</h1>
        <p className="panel-subtitle">
          O campeonato semanal é gerado automaticamente e segue a estrutura de segunda a sexta.
        </p>
      </header>

      <div className="panel-actions wrap">
        <div className="admin-field admin-field-full">
          <span>Modelo do sistema</span>
          <strong>Campeonato Norte semanal</strong>
        </div>
        <div className="admin-field admin-field-full">
          <span>Estrutura</span>
          <strong>segunda, terça, quarta, quinta e sexta</strong>
        </div>
        <button
          className="ghost-button"
          type="button"
          onClick={() => setShowForm((current) => !current)}
          disabled={creating}
          aria-expanded={showForm}
        >
          {showForm ? "Ocultar regras da semana" : "Ver regras da semana"}
        </button>
      </div>

      {showForm ? (
        <div className="admin-schedule-form">
          <p className="admin-section-hint">
            O Campeonato Norte é a unidade principal do sistema. A rodada diária pertence ao campeonato
            semanal e não constitui um campeonato separado.
          </p>
          <ul>
            <li>Segunda → rodada diária 1</li>
            <li>Terça → rodada diária 2</li>
            <li>Quarta → rodada diária 3</li>
            <li>Quinta → rodada diária 4</li>
            <li>Sexta → rodada diária 5</li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}
