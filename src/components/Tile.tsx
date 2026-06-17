import type { CSSProperties } from "react";
import type { LetterStatus } from "../types/game";

type TileProps = {
  letter: string;
  status: LetterStatus;
  index: number;
  isActive?: boolean;
  isEditable?: boolean;
  isRevealing?: boolean;
  onSelect?: (index: number) => void;
};

const STATUS_LABELS: Record<LetterStatus, string> = {
  correct: "correta",
  present: "presente",
  absent: "ausente",
  empty: "vazia",
};

export function Tile({
  letter,
  status,
  index,
  isActive = false,
  isEditable = false,
  isRevealing = false,
  onSelect,
}: TileProps) {
  const displayLetter = letter.toUpperCase();
  const className = [
    "tile",
    status,
    isActive ? "active" : "",
    isEditable ? "editable" : "",
    isRevealing ? "revealing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = isRevealing ? ({ "--tile-delay": `${index * 180}ms` } as CSSProperties) : undefined;
  const label = letter ? `${displayLetter}, ${STATUS_LABELS[status]}` : `casa ${index + 1} vazia`;

  if (isEditable) {
    return (
      <button
        className={className}
        type="button"
        style={style}
        aria-label={`${label}. Selecionar posicao ${index + 1}`}
        aria-pressed={isActive}
        onClick={() => onSelect?.(index)}
      >
        {displayLetter}
      </button>
    );
  }

  return (
    <span
      className={className}
      style={style}
      aria-label={label}
    >
      {displayLetter}
    </span>
  );
}
