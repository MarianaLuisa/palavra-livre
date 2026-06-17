import type { GameMode } from "../types/game";
import { MODE_CONFIG, MODES } from "../utils/constants";

type ModeSelectorProps = {
  activeMode: GameMode;
  disabled?: boolean;
  onChangeMode: (mode: GameMode) => void;
};

export function ModeSelector({ activeMode, disabled = false, onChangeMode }: ModeSelectorProps) {
  return (
    <section className="mode-selector" aria-label="Modos de jogo">
      {MODES.map((mode) => (
        <button
          className={mode === activeMode ? "mode-button active" : "mode-button"}
          key={mode}
          type="button"
          disabled={disabled}
          onClick={() => onChangeMode(mode)}
          aria-pressed={mode === activeMode}
          aria-label={`Modo ${MODE_CONFIG[mode].label}, ${MODE_CONFIG[mode].boardCount} tabuleiro${
            MODE_CONFIG[mode].boardCount === 1 ? "" : "s"
          }, ${MODE_CONFIG[mode].maxAttempts} tentativas`}
        >
          <span>{MODE_CONFIG[mode].label}</span>
          <small>
            {MODE_CONFIG[mode].boardCount} palavra
            {MODE_CONFIG[mode].boardCount === 1 ? "" : "s"} /{" "}
            {MODE_CONFIG[mode].maxAttempts} tentativas
          </small>
        </button>
      ))}
    </section>
  );
}
