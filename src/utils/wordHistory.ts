import answers from "../data/answers.json";
import { ANSWER_HISTORY_STORAGE_KEY } from "./constants";
import { getRandomWords } from "./getRandomWords";
import { normalizeWord } from "./normalizeWord";

type WordHistorySelection = {
  words: string[];
  nextHistory: string[];
  historyWasReset: boolean;
};

function getDefaultStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function uniqueNormalized(words: string[]): string[] {
  return [...new Set(words.map(normalizeWord))];
}

export function selectWordsAvoidingHistory(
  count: number,
  sourceWords: string[],
  usedWords: string[],
  random: () => number = Math.random,
): WordHistorySelection {
  const uniqueSourceWords = [...new Map(sourceWords.map((word) => [normalizeWord(word), word])).values()];
  const normalizedSourceWords = new Set(uniqueSourceWords.map(normalizeWord));
  const normalizedUsedWords = uniqueNormalized(usedWords).filter((word) =>
    normalizedSourceWords.has(word),
  );
  const availableWords = uniqueSourceWords.filter(
    (word) => !normalizedUsedWords.includes(normalizeWord(word)),
  );
  const historyWasReset = availableWords.length < count;
  const pool = historyWasReset ? uniqueSourceWords : availableWords;
  const words = getRandomWords(count, pool, random);
  const selectedWords = words.map(normalizeWord);

  return {
    words,
    nextHistory: historyWasReset
      ? selectedWords
      : [...normalizedUsedWords, ...selectedWords],
    historyWasReset,
  };
}

export function loadWordHistory(storage: Storage | undefined = getDefaultStorage()): string[] {
  if (storage === undefined) {
    return [];
  }

  const rawHistory = storage.getItem(ANSWER_HISTORY_STORAGE_KEY);

  if (rawHistory === null) {
    return [];
  }

  try {
    const history = JSON.parse(rawHistory);
    return Array.isArray(history) ? history.filter((word) => typeof word === "string") : [];
  } catch {
    return [];
  }
}

export function saveWordHistory(
  words: string[],
  storage: Storage | undefined = getDefaultStorage(),
): void {
  if (storage === undefined) {
    return;
  }

  storage.setItem(ANSWER_HISTORY_STORAGE_KEY, JSON.stringify(uniqueNormalized(words)));
}

export function getRandomWordsWithHistory(
  count: number,
  sourceWords: string[] = answers,
  storage: Storage | undefined = getDefaultStorage(),
  random: () => number = Math.random,
): string[] {
  const selection = selectWordsAvoidingHistory(count, sourceWords, loadWordHistory(storage), random);
  saveWordHistory(selection.nextHistory, storage);
  return selection.words;
}
