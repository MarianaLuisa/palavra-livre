import type { StreakInfo } from "../types";

type StreakBadgeProps = {
  streak: StreakInfo;
  compact?: boolean;
};

/**
 * Indicador de sequência.
 * A chama é do Palavra Livre: forma própria, sem copiar outro app.
 */
export function StreakBadge({ streak, compact = false }: StreakBadgeProps) {
  const label =
    streak.current === 0
      ? "Sem sequência ativa"
      : `${streak.current} ${streak.current === 1 ? "dia seguido" : "dias seguidos"}`;

  return (
    <div
      className={compact ? "streak-badge compact" : "streak-badge"}
      title={`Maior sequência: ${streak.longest}`}
    >
      <svg className="streak-flame" viewBox="0 0 24 32" aria-hidden="true">
        <path
          d="M12 0c1.6 5.4-1.3 7.6-3.7 10C5.6 12.7 3 15.5 3 20.2 3 26.7 7.4 32 12 32s9-5.3 9-11.8c0-4-1.9-6.7-4-9.2-1.3 1.4-2.7 2.2-3.6 1.5 1.6-3.2 1-8-1.4-12.5Z"
          fill="currentColor"
        />
      </svg>
      <span className="streak-text">
        <strong>{label}</strong>
        {!compact ? (
          <small>
            Maior sequência: {streak.longest}
            {streak.atRisk ? " · jogue hoje para não perder" : ""}
          </small>
        ) : null}
      </span>
    </div>
  );
}
