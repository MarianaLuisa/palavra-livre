import type { MouseEvent } from "react";
import type { StoredStats } from "../types/game";
import { MODE_CONFIG, MODES } from "../utils/constants";

type StatsModalProps = {
  open: boolean;
  stats: StoredStats;
  onClose: () => void;
};

export function StatsModal({ open, stats, onClose }: StatsModalProps) {
  if (!open) {
    return null;
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <section
        className="modal wide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stats-title"
      >
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          x
        </button>
        <p className="eyebrow">LocalStorage</p>
        <h2 id="stats-title">Estatísticas</h2>
        <div className="stats-grid">
          {MODES.map((mode) => {
            const modeStats = stats[mode];
            const config = MODE_CONFIG[mode];
            const winRate =
              modeStats.played > 0 ? Math.round((modeStats.won / modeStats.played) * 100) : 0;
            const averageGuesses =
              modeStats.played > 0 ? (modeStats.totalGuesses / modeStats.played).toFixed(1) : "0.0";

            return (
              <article className="stats-card" key={mode}>
                <h3>{config.label}</h3>
                <dl>
                  <div>
                    <dt>Jogos</dt>
                    <dd>{modeStats.played}</dd>
                  </div>
                  <div>
                    <dt>Vitórias</dt>
                    <dd>{modeStats.won}</dd>
                  </div>
                  <div>
                    <dt>Derrotas</dt>
                    <dd>{modeStats.lost}</dd>
                  </div>
                  <div>
                    <dt>Aproveitamento</dt>
                    <dd>{winRate}%</dd>
                  </div>
                  <div>
                    <dt>Média</dt>
                    <dd>{averageGuesses}</dd>
                  </div>
                  <div>
                    <dt>Sequência</dt>
                    <dd>{modeStats.currentStreak}</dd>
                  </div>
                  <div>
                    <dt>Melhor</dt>
                    <dd>{modeStats.maxStreak}</dd>
                  </div>
                </dl>
                <div className="distribution" aria-label={`Distribuição de ${config.label}`}>
                  {Array.from({ length: config.maxAttempts }, (_, index) => {
                    const attempt = index + 1;
                    const value = modeStats.winDistribution[String(attempt)] ?? 0;
                    const maxValue = Math.max(1, ...Object.values(modeStats.winDistribution));

                    return (
                      <div className="distribution-row" key={attempt}>
                        <span>{attempt}</span>
                        <div>
                          <span style={{ width: `${Math.max(8, (value / maxValue) * 100)}%` }}>
                            {value}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
