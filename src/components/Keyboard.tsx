import type { LetterStatus } from "../types/game";
import { KEYBOARD_ROWS } from "../utils/constants";

type KeyboardProps = {
  keyStatuses: Record<string, LetterStatus>;
  onKey: (key: string) => void;
};

export function Keyboard({ keyStatuses, onKey }: KeyboardProps) {
  return (
    <section className="keyboard" aria-label="Teclado virtual">
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div className="keyboard-row" key={row}>
          {rowIndex === 2 ? (
            <button
              className="keyboard-key action-key"
              type="button"
              onClick={() => onKey("Enter")}
              aria-label="Enviar tentativa"
            >
              Enter
            </button>
          ) : null}

          {[...row].map((letter) => (
            <button
              className={`keyboard-key ${keyStatuses[letter] ?? "empty"}`}
              key={letter}
              type="button"
              onClick={() => onKey(letter)}
              aria-label={`Letra ${letter.toUpperCase()}`}
            >
              {letter.toUpperCase()}
            </button>
          ))}

          {rowIndex === 2 ? (
            <button
              className="keyboard-key action-key"
              type="button"
              onClick={() => onKey("Backspace")}
              aria-label="Apagar letra"
            >
              Apagar
            </button>
          ) : null}
        </div>
      ))}
    </section>
  );
}
