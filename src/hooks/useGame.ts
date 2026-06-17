import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import validWords from "../data/validWords.json";
import type { BoardState, GameMode, GameStatus, StoredStats } from "../types/game";
import {
  MODE_CONFIG,
  MODE_STORAGE_KEY,
  REVEAL_TOTAL_MS,
  STATS_STORAGE_KEY,
  WORD_LENGTH,
} from "../utils/constants";
import { evaluateGuess } from "../utils/evaluateGuess";
import {
  createEmptyGuess,
  guessLettersToWord,
  isCompleteGuess,
  removeGuessLetter,
  setGuessLetter,
} from "../utils/guessInput";
import { getKeyboardStatus } from "../utils/keyboardStatus";
import { normalizeWord } from "../utils/normalizeWord";
import {
  createEmptyStats,
  normalizeStats,
  recordFinishedGame,
} from "../utils/storage";
import { getRandomWordsWithHistory } from "../utils/wordHistory";
import { useLocalStorage } from "./useLocalStorage";

const normalizedValidWords = new Set(validWords.map((word) => normalizeWord(word)));
const SUBMIT_LOCK_MS = 280;

function isGameMode(value: unknown): value is GameMode {
  return typeof value === "string" && value in MODE_CONFIG;
}

function createBoards(mode: GameMode): BoardState[] {
  return getRandomWordsWithHistory(MODE_CONFIG[mode].boardCount).map((answer) => ({
    answer,
    solved: false,
    rows: [],
  }));
}

function clampTileIndex(index: number): number {
  return Math.min(Math.max(index, 0), WORD_LENGTH - 1);
}

export function useGame() {
  const [storedMode, setStoredMode] = useLocalStorage<GameMode>(
    MODE_STORAGE_KEY,
    "simple",
  );
  const mode = isGameMode(storedMode) ? storedMode : "simple";
  const [stats, setStats] = useLocalStorage<StoredStats>(
    STATS_STORAGE_KEY,
    createEmptyStats(),
  );
  const [boards, setBoards] = useState<BoardState[]>(() => createBoards(mode));
  const [currentGuessLetters, setCurrentGuessLetters] = useState<string[]>(() => createEmptyGuess());
  const [activeTileIndex, setActiveTileIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [message, setMessage] = useState("");
  const [messageId, setMessageId] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealingAnswers, setRevealingAnswers] = useState<string[]>([]);
  const lastSubmitAtRef = useRef(0);
  const gameFinishedRef = useRef(false);
  const isRevealingRef = useRef(false);
  const revealTimeoutRef = useRef<number | null>(null);

  const config = MODE_CONFIG[mode];
  const normalizedStats = useMemo(() => normalizeStats(stats), [stats]);
  const keyboardSourceBoards = useMemo(() => {
    if (!isRevealing) {
      return boards;
    }

    return boards.map((board) => {
      if (!revealingAnswers.includes(board.answer)) {
        return board;
      }

      return {
        ...board,
        rows: board.rows.slice(0, -1),
      };
    });
  }, [boards, isRevealing, revealingAnswers]);
  const keyboardStatuses = useMemo(() => getKeyboardStatus(keyboardSourceBoards), [keyboardSourceBoards]);
  const currentGuess = guessLettersToWord(currentGuessLetters);
  const solvedCount = boards.filter((board) => board.solved).length;

  useEffect(() => {
    return () => {
      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
      }
    };
  }, []);

  const showMessage = useCallback((text: string) => {
    setMessage(text);
    setMessageId((previousId) => previousId + 1);
  }, []);

  const clearMessage = useCallback(() => {
    setMessage("");
  }, []);

  const resetGame = useCallback(
    (nextMode: GameMode = mode) => {
      if (isRevealingRef.current) {
        return;
      }

      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
      }

      gameFinishedRef.current = false;
      lastSubmitAtRef.current = 0;
      setBoards(createBoards(nextMode));
      setCurrentGuessLetters(createEmptyGuess());
      setActiveTileIndex(0);
      setAttempt(0);
      setStatus("playing");
      setMessage("");
      setIsRevealing(false);
      setRevealingAnswers([]);
    },
    [mode],
  );

  const changeMode = useCallback(
    (nextMode: GameMode) => {
      if (isRevealingRef.current) {
        return;
      }

      setStoredMode(nextMode);
      resetGame(nextMode);
    },
    [resetGame, setStoredMode],
  );

  const selectTile = useCallback(
    (index: number) => {
      if (status !== "playing" || isRevealingRef.current) {
        return;
      }

      setActiveTileIndex(clampTileIndex(index));
    },
    [status],
  );

  const addLetter = useCallback(
    (letter: string) => {
      if (status !== "playing" || isRevealingRef.current) {
        return;
      }

      setCurrentGuessLetters((previousLetters) => {
        const result = setGuessLetter(previousLetters, activeTileIndex, letter);
        setActiveTileIndex(result.activeIndex);
        return result.letters;
      });
      setMessage("");
    },
    [activeTileIndex, status],
  );

  const removeLetter = useCallback(() => {
    if (status !== "playing" || isRevealingRef.current) {
      return;
    }

    setCurrentGuessLetters((previousLetters) => {
      const result = removeGuessLetter(previousLetters, activeTileIndex);
      setActiveTileIndex(result.activeIndex);
      return result.letters;
    });
    setMessage("");
  }, [activeTileIndex, status]);

  const finishReveal = useCallback(
    (
      finalBoards: BoardState[],
      nextAttempt: number,
      nextStatus: GameStatus,
    ) => {
      setBoards(finalBoards);
      setAttempt(nextAttempt);
      setStatus(nextStatus);
      setIsRevealing(false);
      setRevealingAnswers([]);
      isRevealingRef.current = false;
      revealTimeoutRef.current = null;

      if (nextStatus !== "playing" && !gameFinishedRef.current) {
        gameFinishedRef.current = true;
        setStats((previousStats) =>
          recordFinishedGame(previousStats, mode, nextStatus === "won", nextAttempt),
        );
      }
    },
    [mode, setStats],
  );

  const submitGuess = useCallback(() => {
    if (status !== "playing" || isRevealingRef.current || gameFinishedRef.current) {
      return;
    }

    if (!isCompleteGuess(currentGuessLetters)) {
      showMessage("Complete a palavra.");
      return;
    }

    const normalizedGuess = normalizeWord(currentGuess);

    if (!normalizedValidWords.has(normalizedGuess)) {
      showMessage("Essa palavra ainda nao esta na lista.");
      return;
    }

    const now = Date.now();

    if (now - lastSubmitAtRef.current < SUBMIT_LOCK_MS) {
      return;
    }

    lastSubmitAtRef.current = now;

    const revealingBoards: string[] = [];
    const evaluatedBoards = boards.map((board) => {
      if (board.solved) {
        return board;
      }

      const evaluatedRow = evaluateGuess(normalizedGuess, board.answer);
      revealingBoards.push(board.answer);

      return {
        ...board,
        rows: [...board.rows, evaluatedRow],
      };
    });
    const finalBoards = evaluatedBoards.map((board) => {
      if (!revealingBoards.includes(board.answer)) {
        return board;
      }

      const lastRow = board.rows.at(-1) ?? [];
      const solved = lastRow.every(({ status: letterStatus }) => letterStatus === "correct");

      return {
        ...board,
        solved,
      };
    });
    const nextAttempt = attempt + 1;
    const nextStatus: GameStatus = finalBoards.every((board) => board.solved)
      ? "won"
      : nextAttempt >= config.maxAttempts
        ? "lost"
        : "playing";

    isRevealingRef.current = true;
    setIsRevealing(true);
    setRevealingAnswers(revealingBoards);
    setBoards(evaluatedBoards);
    setCurrentGuessLetters(createEmptyGuess());
    setActiveTileIndex(0);
    setMessage("");

    revealTimeoutRef.current = window.setTimeout(() => {
      finishReveal(finalBoards, nextAttempt, nextStatus);
    }, REVEAL_TOTAL_MS);
  }, [
    attempt,
    boards,
    config.maxAttempts,
    currentGuess,
    currentGuessLetters,
    finishReveal,
    showMessage,
    status,
  ]);

  const handleKey = useCallback(
    (key: string): boolean => {
      if (status !== "playing" || isRevealingRef.current) {
        return false;
      }

      if (key === "Enter") {
        submitGuess();
        return true;
      }

      if (key === "Backspace") {
        removeLetter();
        return true;
      }

      if (key === "ArrowLeft") {
        setActiveTileIndex((previousIndex) => clampTileIndex(previousIndex - 1));
        return true;
      }

      if (key === "ArrowRight") {
        setActiveTileIndex((previousIndex) => clampTileIndex(previousIndex + 1));
        return true;
      }

      const normalizedKey = normalizeWord(key);

      if (normalizedKey.length === 1 && /^[a-z]$/.test(normalizedKey)) {
        addLetter(normalizedKey);
        return true;
      }

      return false;
    },
    [addLetter, removeLetter, status, submitGuess],
  );

  return {
    mode,
    config,
    boards,
    currentGuess,
    currentGuessLetters,
    activeTileIndex,
    attempt,
    status,
    message,
    messageId,
    solvedCount,
    stats: normalizedStats,
    keyboardStatuses,
    isRevealing,
    revealingAnswers,
    resetGame,
    changeMode,
    addLetter,
    removeLetter,
    submitGuess,
    handleKey,
    clearMessage,
    selectTile,
  };
}
