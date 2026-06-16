import type { LetterStatus } from "../types/game";

type TileProps = {
  letter: string;
  status: LetterStatus;
};

const STATUS_LABELS: Record<LetterStatus, string> = {
  correct: "correta",
  present: "presente",
  absent: "ausente",
  empty: "vazia",
};

export function Tile({ letter, status }: TileProps) {
  const displayLetter = letter.toUpperCase();

  return (
    <span
      className={`tile ${status}`}
      aria-label={letter ? `${displayLetter}, ${STATUS_LABELS[status]}` : "casa vazia"}
    >
      {displayLetter}
    </span>
  );
}
