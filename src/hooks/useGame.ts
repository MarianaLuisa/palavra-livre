import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import validWords from "../data/validWords.json";
import type {
  BoardState,
  CycleResults,
  FinishedGamePayload,
  FinishedModeResult,
  GameMode,
  GameStatus,
  SavedGameProgress,
  StoredGameProgress,
  StoredStats,
} from "../types/game";
import {
  CYCLE_RESULTS_STORAGE_KEY,
  GAME_PROGRESS_STORAGE_KEY,
  MODE_CONFIG,
  MODE_STORAGE_KEY,
  MODES,
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

type ResetGameOptions = {
  force?: boolean;
};

export type UseGameOptions = {
  /**
   * Chamado uma unica vez quando uma partida termina.
   * Existe para que quem estiver logado possa persistir o resultado.
   * O Jogo Livre continua funcionando normalmente sem este callback.
   */
  onGameFinished?: (payload: FinishedGamePayload) => void;
};

type GameSnapshot = {
  boards: BoardState[];
  currentGuessLetters: string[];
  activeTileIndex: number;
  attempt: number;
  status: GameStatus;
  /** Identificador da partida, estavel entre refreshes. */
  gameId: string;
  startedAt: string;
};

function createGameId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

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

function createFreshSnapshot(mode: GameMode): GameSnapshot {
  return {
    boards: createBoards(mode),
    currentGuessLetters: createEmptyGuess(),
    activeTileIndex: 0,
    attempt: 0,
    status: "playing",
    gameId: createGameId(),
    startedAt: new Date().toISOString(),
  };
}

function createFinishedSnapshot(result: FinishedModeResult): GameSnapshot {
  return {
    boards: result.boards,
    currentGuessLetters: createEmptyGuess(),
    activeTileIndex: 0,
    attempt: result.attemptsUsed,
    status: result.status,
    gameId: createGameId(),
    startedAt: result.finishedAt,
  };
}

function createProgressSnapshot(progress: SavedGameProgress): GameSnapshot {
  return {
    boards: progress.boards,
    currentGuessLetters: progress.currentGuessLetters,
    activeTileIndex: clampTileIndex(progress.activeTileIndex),
    attempt: progress.attempt,
    status: progress.status,
    // Progresso salvo antes desta versao nao tem identificador: cria um.
    gameId: progress.gameId ?? createGameId(),
    startedAt: progress.startedAt ?? progress.updatedAt,
  };
}

function normalizeCycleResults(results: CycleResults | null): CycleResults {
  if (results === null || typeof results !== "object") {
    return {};
  }

  return MODES.reduce((normalizedResults, mode) => {
    const result = results[mode];

    if (
      result !== undefined &&
      result.mode === mode &&
      typeof result.attemptsUsed === "number" &&
      Array.isArray(result.boards)
    ) {
      normalizedResults[mode] = result;
    }

    return normalizedResults;
  }, {} as CycleResults);
}

function isGameStatus(value: unknown): value is GameStatus {
  return value === "playing" || value === "won" || value === "lost";
}

function normalizeGuessLetters(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== WORD_LENGTH) {
    return null;
  }

  const normalizedLetters = value.map((letter) =>
    typeof letter === "string" ? normalizeWord(letter).slice(0, 1) : "",
  );

  if (!normalizedLetters.every((letter) => letter === "" || /^[a-z]$/.test(letter))) {
    return null;
  }

  return normalizedLetters;
}

function normalizeGameProgress(progress: StoredGameProgress | null): StoredGameProgress {
  if (progress === null || typeof progress !== "object") {
    return {};
  }

  return MODES.reduce((normalizedProgress, mode) => {
    const savedProgress = progress[mode];
    const currentGuessLetters = normalizeGuessLetters(savedProgress?.currentGuessLetters);

    if (
      savedProgress !== undefined &&
      savedProgress.mode === mode &&
      Array.isArray(savedProgress.boards) &&
      typeof savedProgress.activeTileIndex === "number" &&
      typeof savedProgress.attempt === "number" &&
      isGameStatus(savedProgress.status) &&
      currentGuessLetters !== null
    ) {
      normalizedProgress[mode] = {
        ...savedProgress,
        currentGuessLetters,
        activeTileIndex: clampTileIndex(savedProgress.activeTileIndex),
      };
    }

    return normalizedProgress;
  }, {} as StoredGameProgress);
}

function clampTileIndex(index: number): number {
  return Math.min(Math.max(index, 0), WORD_LENGTH - 1);
}

export function useGame(options: UseGameOptions = {}) {
  const [storedMode, setStoredMode] = useLocalStorage<GameMode>(
    MODE_STORAGE_KEY,
    "simple",
  );
  const mode = isGameMode(storedMode) ? storedMode : "simple";
  const [stats, setStats] = useLocalStorage<StoredStats>(
    STATS_STORAGE_KEY,
    createEmptyStats(),
  );
  const [cycleResults, setCycleResults] = useLocalStorage<CycleResults>(
    CYCLE_RESULTS_STORAGE_KEY,
    {},
  );
  const [storedGameProgress, setStoredGameProgress] = useLocalStorage<StoredGameProgress>(
    GAME_PROGRESS_STORAGE_KEY,
    {},
  );
  const initialCycleResults = normalizeCycleResults(cycleResults);
  const initialGameProgress = normalizeGameProgress(storedGameProgress);
  const initialSnapshotRef = useRef<GameSnapshot | null>(null);

  if (initialSnapshotRef.current === null) {
    const savedResult = initialCycleResults[mode];
    const savedProgress = initialGameProgress[mode];
    initialSnapshotRef.current =
      savedResult !== undefined
        ? createFinishedSnapshot(savedResult)
        : savedProgress !== undefined
          ? createProgressSnapshot(savedProgress)
        : createFreshSnapshot(mode);
  }

  const [boards, setBoards] = useState<BoardState[]>(() => initialSnapshotRef.current!.boards);
  const [currentGuessLetters, setCurrentGuessLetters] = useState<string[]>(
    () => initialSnapshotRef.current!.currentGuessLetters,
  );
  const [activeTileIndex, setActiveTileIndex] = useState(
    () => initialSnapshotRef.current!.activeTileIndex,
  );
  const [attempt, setAttempt] = useState(() => initialSnapshotRef.current!.attempt);
  const [status, setStatus] = useState<GameStatus>(() => initialSnapshotRef.current!.status);
  const gameIdRef = useRef(initialSnapshotRef.current!.gameId);
  const startedAtRef = useRef(initialSnapshotRef.current!.startedAt);
  // Ref evita que trocar o callback recrie submitGuess a cada render.
  const onGameFinishedRef = useRef(options.onGameFinished);
  onGameFinishedRef.current = options.onGameFinished;
  const [message, setMessage] = useState("");
  const [messageId, setMessageId] = useState(0);
  const [invalidGuessId, setInvalidGuessId] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealingAnswers, setRevealingAnswers] = useState<string[]>([]);
  const lastSubmitAtRef = useRef(0);
  const gameFinishedRef = useRef(initialSnapshotRef.current.status !== "playing");
  const isRevealingRef = useRef(false);
  const revealTimeoutRef = useRef<number | null>(null);

  const config = MODE_CONFIG[mode];
  const normalizedStats = useMemo(() => normalizeStats(stats), [stats]);
  const normalizedCycleResults = useMemo(
    () => normalizeCycleResults(cycleResults),
    [cycleResults],
  );
  const normalizedGameProgress = useMemo(
    () => normalizeGameProgress(storedGameProgress),
    [storedGameProgress],
  );
  const completedModes = useMemo(
    () => MODES.filter((cycleMode) => normalizedCycleResults[cycleMode] !== undefined),
    [normalizedCycleResults],
  );
  const allModesCompleted = completedModes.length === MODES.length;
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
  const hasSubmittedGuess = boards.some((board) => board.rows.length > 0);
  const canRestart = status !== "playing" && !isRevealing && allModesCompleted;
  const canChangeMode = !isRevealing && (status !== "playing" || !hasSubmittedGuess);
  const cycleProgress = {
    completed: completedModes.length,
    total: MODES.length,
    allCompleted: allModesCompleted,
    completedModes,
  };

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

  const showGuessError = useCallback(
    (text: string) => {
      showMessage(text);
      setInvalidGuessId((previousId) => previousId + 1);
    },
    [showMessage],
  );

  const clearMessage = useCallback(() => {
    setMessage("");
  }, []);

  const saveGameProgress = useCallback(
    (snapshot: Omit<SavedGameProgress, "mode" | "updatedAt">, snapshotMode: GameMode = mode) => {
      setStoredGameProgress((previousProgress) => ({
        ...normalizeGameProgress(previousProgress),
        [snapshotMode]: {
          mode: snapshotMode,
          gameId: gameIdRef.current,
          startedAt: startedAtRef.current,
          ...snapshot,
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    [mode, setStoredGameProgress],
  );

  useEffect(() => {
    if (isRevealing) {
      return;
    }

    saveGameProgress({
      boards,
      currentGuessLetters,
      activeTileIndex,
      attempt,
      status,
    });
  }, [
    activeTileIndex,
    attempt,
    boards,
    currentGuessLetters,
    isRevealing,
    saveGameProgress,
    status,
  ]);

  const resetGame = useCallback(
    (nextMode: GameMode = mode, options: ResetGameOptions = {}) => {
      if (isRevealingRef.current) {
        return false;
      }

      if (!options.force && status === "playing") {
        showMessage("Termine a partida antes de jogar novamente.");
        return false;
      }

      if (!options.force && !allModesCompleted) {
        showMessage("Complete os 4 modos antes de jogar novamente.");
        return false;
      }

      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
      }

      if (!options.force) {
        setCycleResults({});
        setStoredGameProgress({});
      }

      gameFinishedRef.current = false;
      lastSubmitAtRef.current = 0;
      gameIdRef.current = createGameId();
      startedAtRef.current = new Date().toISOString();
      setBoards(createBoards(nextMode));
      setCurrentGuessLetters(createEmptyGuess());
      setActiveTileIndex(0);
      setAttempt(0);
      setStatus("playing");
      setMessage("");
      setInvalidGuessId(0);
      setIsRevealing(false);
      setRevealingAnswers([]);
      return true;
    },
    [allModesCompleted, mode, setCycleResults, setStoredGameProgress, showMessage, status],
  );

  const changeMode = useCallback(
    (nextMode: GameMode) => {
      if (isRevealingRef.current) {
        return false;
      }

      if (status === "playing" && hasSubmittedGuess) {
        showMessage("Termine a partida antes de trocar de modo.");
        return false;
      }

      setStoredMode(nextMode);

      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
      }

      const savedResult = normalizedCycleResults[nextMode];
      const savedProgress = normalizedGameProgress[nextMode];
      const nextSnapshot =
        savedResult !== undefined
          ? createFinishedSnapshot(savedResult)
          : savedProgress !== undefined
            ? createProgressSnapshot(savedProgress)
          : createFreshSnapshot(nextMode);

      gameFinishedRef.current = nextSnapshot.status !== "playing";
      lastSubmitAtRef.current = 0;
      gameIdRef.current = nextSnapshot.gameId;
      startedAtRef.current = nextSnapshot.startedAt;
      setBoards(nextSnapshot.boards);
      setCurrentGuessLetters(createEmptyGuess());
      setActiveTileIndex(0);
      setAttempt(nextSnapshot.attempt);
      setStatus(nextSnapshot.status);
      setMessage("");
      setInvalidGuessId(0);
      setIsRevealing(false);
      setRevealingAnswers([]);
      return true;
    },
    [
      hasSubmittedGuess,
      normalizedCycleResults,
      normalizedGameProgress,
      setStoredMode,
      showMessage,
      status,
    ],
  );

  const selectTile = useCallback(
    (index: number) => {
      if (status !== "playing" || isRevealingRef.current) {
        return;
      }

      setInvalidGuessId(0);
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
      setInvalidGuessId(0);
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
    setInvalidGuessId(0);
  }, [activeTileIndex, status]);

  /**
   * Avisa uma unica vez que a partida terminou.
   * O guard gameFinishedRef ja garante uma chamada por partida.
   */
  const notifyGameFinished = useCallback(
    (
      finalBoards: BoardState[],
      nextAttempt: number,
      nextStatus: Exclude<GameStatus, "playing">,
      finishedMode: GameMode,
    ) => {
      onGameFinishedRef.current?.({
        gameId: gameIdRef.current,
        mode: finishedMode,
        status: nextStatus,
        attemptsUsed: nextAttempt,
        wordsSolved: finalBoards.filter((board) => board.solved).length,
        wordsTotal: finalBoards.length,
        startedAt: startedAtRef.current,
        finishedAt: new Date().toISOString(),
      });
    },
    [],
  );

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
        setCycleResults((previousResults) => ({
          ...normalizeCycleResults(previousResults),
          [mode]: {
            mode,
            status: nextStatus,
            attemptsUsed: nextAttempt,
            boards: finalBoards,
            finishedAt: new Date().toISOString(),
          },
        }));
        setStats((previousStats) =>
          recordFinishedGame(previousStats, mode, nextStatus === "won", nextAttempt),
        );
        notifyGameFinished(finalBoards, nextAttempt, nextStatus, mode);
      }
    },
    [mode, notifyGameFinished, setCycleResults, setStats],
  );

  const submitGuess = useCallback(() => {
    if (status !== "playing" || isRevealingRef.current || gameFinishedRef.current) {
      return;
    }

    if (!isCompleteGuess(currentGuessLetters)) {
      showGuessError("Complete a palavra.");
      return;
    }

    const normalizedGuess = normalizeWord(currentGuess);

    if (!normalizedValidWords.has(normalizedGuess)) {
      showGuessError("Essa palavra não é aceita.");
      return;
    }

    const now = Date.now();

    if (now - lastSubmitAtRef.current < SUBMIT_LOCK_MS) {
      return;
    }

    lastSubmitAtRef.current = now;
    setInvalidGuessId(0);

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

    saveGameProgress({
      boards: finalBoards,
      currentGuessLetters: createEmptyGuess(),
      activeTileIndex: 0,
      attempt: nextAttempt,
      status: nextStatus,
    });

    if (nextStatus !== "playing" && !gameFinishedRef.current) {
      gameFinishedRef.current = true;
      setCycleResults((previousResults) => ({
        ...normalizeCycleResults(previousResults),
        [mode]: {
          mode,
          status: nextStatus,
          attemptsUsed: nextAttempt,
          boards: finalBoards,
          finishedAt: new Date().toISOString(),
        },
      }));
      setStats((previousStats) =>
        recordFinishedGame(previousStats, mode, nextStatus === "won", nextAttempt),
      );
      notifyGameFinished(finalBoards, nextAttempt, nextStatus, mode);
    }

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
    mode,
    notifyGameFinished,
    saveGameProgress,
    setCycleResults,
    setStats,
    showGuessError,
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
    invalidGuessId,
    solvedCount,
    hasSubmittedGuess,
    canRestart,
    canChangeMode,
    cycleProgress,
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
