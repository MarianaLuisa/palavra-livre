import answers from "../data/answers.json";
import { normalizeWord } from "./normalizeWord";

export function getRandomWords(
  count: number,
  sourceWords: string[] = answers,
  random: () => number = Math.random,
): string[] {
  const uniqueWords = [...new Map(sourceWords.map((word) => [normalizeWord(word), word])).values()];

  if (count > uniqueWords.length) {
    throw new Error("Não há palavras suficientes para sortear respostas únicas.");
  }

  const shuffledWords = [...uniqueWords];

  for (let index = shuffledWords.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffledWords[index], shuffledWords[swapIndex]] = [
      shuffledWords[swapIndex],
      shuffledWords[index],
    ];
  }

  return shuffledWords.slice(0, count);
}
