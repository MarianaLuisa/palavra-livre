import type { GameMode } from "../types/game";
import { MODE_CONFIG, MODES } from "../utils/constants";

type ModeSelectorProps = {
  activeMode: GameMode;
  completedModes?: GameMode[];
  disabled?: boolean;
  onChangeMode: (mode: GameMode) => void;
};

export function ModeSelector({
  activeMode,
  completedModes = [],
  disabled = false,
  onChangeMode,
}: ModeSelectorProps) {
  return (
    <section className="mode-selector" aria-label="Modos de jogo">
      {MODES.map((mode) => {
        const completed = completedModes.includes(mode);
        const className = [
          "mode-button",
          mode === activeMode ? "active" : "",
          completed ? "completed" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            className={className}
            key={mode}
            type="button"
            disabled={disabled}
            onClick={() => onChangeMode(mode)}
            aria-pressed={mode === activeMode}
            aria-label={`Modo ${MODE_CONFIG[mode].label}, ${MODE_CONFIG[mode].boardCount} tabuleiro${
              MODE_CONFIG[mode].boardCount === 1 ? "" : "s"
            }, ${MODE_CONFIG[mode].maxAttempts} tentativas${
              completed ? ", concluido neste ciclo" : ""
            }`}
          >
            <span>{MODE_CONFIG[mode].label}</span>
            <small>
              {completed
                ? "Concluido"
                : `${MODE_CONFIG[mode].boardCount} palavra${
                    MODE_CONFIG[mode].boardCount === 1 ? "" : "s"
                  } / ${MODE_CONFIG[mode].maxAttempts} tentativas`}
            </small>
          </button>
        );
      })}
    </section>
  );
}
