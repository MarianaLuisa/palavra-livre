import { formatScore } from "../format";

export type PodiumPlace = {
  position: number;
  displayName: string;
  totalScore: number | null;
  wordsSolved: number | null;
};

type PodiumProps = {
  places: PodiumPlace[];
  highlightName?: string | null;
};

const PLACE_CLASS: Record<number, string> = {
  1: "podium-place first",
  2: "podium-place second",
  3: "podium-place third",
};

const PLACE_LABEL: Record<number, string> = {
  1: "Campeão do dia",
  2: "Vice-campeão",
  3: "Terceiro lugar",
};

export function Podium({ places, highlightName = null }: PodiumProps) {
  if (places.length === 0) {
    return null;
  }

  // Ordem visual classica: 2, 1, 3.
  const displayOrder = [2, 1, 3]
    .map((position) => places.find((place) => place.position === position))
    .filter((place): place is PodiumPlace => place !== undefined);

  return (
    <section className="podium" aria-label="Pódio do campeonato">
      {displayOrder.map((place) => (
        <article
          key={place.position}
          className={[
            PLACE_CLASS[place.position] ?? "podium-place",
            place.displayName === highlightName ? "current-user" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="podium-position">{place.position}º</span>
          <strong className="podium-name">{place.displayName}</strong>
          <small className="podium-label">{PLACE_LABEL[place.position] ?? ""}</small>
          <span className="podium-score">{formatScore(place.totalScore)} pts</span>
          {place.wordsSolved !== null ? (
            <small className="podium-words">{place.wordsSolved}/13 palavras</small>
          ) : null}
        </article>
      ))}
    </section>
  );
}
