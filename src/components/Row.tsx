import type { EvaluatedLetter } from "../types/game";
import { WORD_LENGTH } from "../utils/constants";
import { Tile } from "./Tile";

type RowProps = {
  letters: EvaluatedLetter[];
  isCurrent?: boolean;
  isEvaluated?: boolean;
};

export function Row({ letters, isCurrent = false, isEvaluated = false }: RowProps) {
  const completeLetters = Array.from({ length: WORD_LENGTH }, (_, index) => {
    return letters[index] ?? { letter: "", status: "empty" as const };
  });
  const className = [
    "row",
    isCurrent ? "current" : "",
    isEvaluated ? "evaluated" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      {completeLetters.map((letter, index) => (
        <Tile
          key={`${letter.letter}-${index}`}
          letter={letter.letter}
          status={letter.status}
        />
      ))}
    </div>
  );
}
