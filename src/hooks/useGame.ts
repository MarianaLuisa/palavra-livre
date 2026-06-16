import { useCallback, useMemo, useRef, useState } from "react";
import validWords from "../data/validWords.json";
import type { BoardState, GameMode, GameStatus, StoredStats } from "../types/game";
import {
  MODE_CONFIG,
  MODE_STORAGE_KEY,
  STATS_STORAGE_KEY,
  WORD_LENGTH,
} from "../utils/constants";
import { evaluateGuess } from "../utils/evaluateGuess";
import { getRandomWords } from "../utils/getRandomWords";
import { getKeyboardStatus } from "../utils/keyboardStatus";
import { normalizeWord } from "../utils/normalizeWord";
import {
  createEmptyStats,
  normalizeStats,
  recordFinishedGame,
} from "../utils/storage";
import { useLocalStorage } from "./useLocalStorage";

const normalizedValidWords = new Set(validWords.map((word) => normalizeWord(word)));
const SUBMIT_LOCK_MS = 280;

function isGameMode(value: unknown): value is GameMode {
  return typeof value === "string" && value in MODE_CONFIG;
}

function createBoards(mode: GameMode): BoardState[] {
  return getRandomWords(MODE_CONFIG[mode].boardCount).map((answer) => ({
    answer,
    solved: false,
    rows: [],
  }));
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
  const [currentGuess, setCurrentGuess] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [message, setMessage] = useState("");
  const [messageId, setMessageId] = useState(0);
  const lastSubmitAtRef = useRef(0);
  const gameFinishedRef = useRef(false);

  const config = MODE_CONFIG[mode];
  const normalizedStats = useMemo(() => normalizeStats(stats), [stats]);
  const keyboardStatuses = useMemo(() => getKeyboardStatus(boards), [boards]);
  const solvedCount = boards.filter((board) => board.solved).length;

  const showMessage = useCallback((text: string) => {
    setMessage(text);
    setMessageId((previousId) => previousId + 1);
  }, []);

  const clearMessage = useCallback(() => {
    setMessage("");
  }, []);

  const resetGame = useCallback(
    (nextMode: GameMode = mode) => {
      gameFinishedRef.current = false;
      lastSubmitAtRef.current = 0;
      setBoards(createBoards(nextMode));
      setCurrentGuess("");
      setAttempt(0);
      setStatus("playing");
      setMessage("");
    },
    [mode],
  );

  const changeMode = useCallback(
    (nextMode: GameMode) => {
      setStoredMode(nextMode);
      resetGame(nextMode);
    },
    [resetGame, setStoredMode],
  );

  const addLetter = useCallback(
    (letter: string) => {
      if (status !== "playing" || currentGuess.length >= WORD_LENGTH) {
        return;
      }

      const normalizedLetter = normalizeWord(letter);

      if (/^[a-z]$/.test(normalizedLetter)) {
        setCurrentGuess((previousGuess) => previousGuess + normalizedLetter);
        setMessage("");
      }
    },
    [currentGuess.length, status],
  );

  const removeLetter = useCallback(() => {
    if (status !== "playing") {
      return;
    }

    setCurrentGuess((previousGuess) => previousGuess.slice(0, -1));
    setMessage("");
  }, [status]);

  const submitGuess = useCallback(() => {
    if (status !== "playing" || gameFinishedRef.current) {
      return;
    }

    const normalizedGuess = normalizeWord(currentGuess);

    if (normalizedGuess.length !== WORD_LENGTH) {
      showMessage("Digite uma palavra com 5 letras.");
      return;
    }

    if (!normalizedValidWords.has(normalizedGuess)) {
      showMessage("Essa palavra ainda nao esta na lista.");
      return;
    }

    const now = Date.now();

    if (now - lastSubmitAtRef.current < SUBMIT_LOCK_MS) {
      return;
    }

    lastSubmitAtRef.current = now;

    const nextBoards = boards.map((board) => {
      if (board.solved) {
        return board;
      }

      const evaluatedRow = evaluateGuess(normalizedGuess, board.answer);
      const solved = evaluatedRow.every(({ status: letterStatus }) => letterStatus === "correct");

      return {
        ...board,
        solved,
        rows: [...board.rows, evaluatedRow],
      };
    });

    const nextAttempt = attempt + 1;
    const nextStatus: GameStatus = nextBoards.every((board) => board.solved)
      ? "won"
      : nextAttempt >= config.maxAttempts
        ? "lost"
        : "playing";

    if (nextStatus !== "playing") {
      gameFinishedRef.current = true;
      setStats((previousStats) =>
        recordFinishedGame(previousStats, mode, nextStatus === "won", nextAttempt),
      );
    }

    setBoards(nextBoards);
    setAttempt(nextAttempt);
    setCurrentGuess("");
    setStatus(nextStatus);
    setMessage("");
  }, [
    attempt,
    boards,
    config.maxAttempts,
    currentGuess,
    mode,
    setStats,
    showMessage,
    status,
  ]);

  const handleKey = useCallback(
    (key: string): boolean => {
      if (status !== "playing") {
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
    attempt,
    status,
    message,
    messageId,
    solvedCount,
    stats: normalizedStats,
    keyboardStatuses,
    resetGame,
    changeMode,
    addLetter,
    removeLetter,
    submitGuess,
    handleKey,
    clearMessage,
  };
}
