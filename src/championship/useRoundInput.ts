import { useCallback, useEffect, useRef, useState } from "react";
import { REVEAL_TOTAL_MS, WORD_LENGTH } from "../utils/constants";
import {
  clearGuessLetter,
  createEmptyGuess,
  guessLettersToWord,
  isCompleteGuess,
  removeGuessLetter,
  setGuessLetter,
} from "../utils/guessInput";
import { normalizeWord } from "../utils/normalizeWord";

function clampTileIndex(index: number): number {
  return Math.min(Math.max(index, 0), WORD_LENGTH - 1);
}

type UseRoundInputOptions = {
  roundId: string | null;
  enabled: boolean;
  onSubmit: (word: string) => Promise<boolean>;
};

type UseRoundInputResult = {
  letters: string[];
  activeTileIndex: number;
  isRevealing: boolean;
  message: string;
  messageId: number;
  invalidGuessId: number;
  selectTile: (index: number) => void;
  handleKey: (key: string) => boolean;
  clearMessage: () => void;
};

/**
 * Entrada da tentativa no campeonato.
 * Reaproveita as mesmas funcoes de digitacao do Jogo Livre; a validacao
 * de verdade (palavra aceita, tentativas restantes, pontuacao) acontece
 * no servidor. Aqui so tratamos ergonomia e a animacao de revelacao.
 */
export function useRoundInput({
  roundId,
  enabled,
  onSubmit,
}: UseRoundInputOptions): UseRoundInputResult {
  const [letters, setLetters] = useState<string[]>(createEmptyGuess);
  const [activeTileIndex, setActiveTileIndex] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageId, setMessageId] = useState(0);
  const [invalidGuessId, setInvalidGuessId] = useState(0);
  const revealTimeoutRef = useRef<number | null>(null);
  const submittingRef = useRef(false);

  // Trocou de modalidade: limpa a digitacao.
  useEffect(() => {
    setLetters(createEmptyGuess());
    setActiveTileIndex(0);
    setMessage("");
    setInvalidGuessId(0);
  }, [roundId]);

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

  const submit = useCallback(async () => {
    if (!enabled || submittingRef.current || isRevealing) {
      return;
    }

    if (!isCompleteGuess(letters)) {
      showGuessError("Complete a palavra.");
      return;
    }

    submittingRef.current = true;
    const word = guessLettersToWord(letters);
    const accepted = await onSubmit(word);
    submittingRef.current = false;

    if (!accepted) {
      setInvalidGuessId((previousId) => previousId + 1);
      return;
    }

    setLetters(createEmptyGuess());
    setActiveTileIndex(0);
    setMessage("");
    setInvalidGuessId(0);
    setIsRevealing(true);

    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
    }

    revealTimeoutRef.current = window.setTimeout(() => {
      setIsRevealing(false);
      revealTimeoutRef.current = null;
    }, REVEAL_TOTAL_MS);
  }, [enabled, isRevealing, letters, onSubmit, showGuessError]);

  const handleKey = useCallback(
    (key: string): boolean => {
      if (!enabled || isRevealing) {
        return false;
      }

      if (key === "Enter") {
        void submit();
        return true;
      }

      if (key === "Backspace") {
        setLetters((previousLetters) => {
          const result = removeGuessLetter(previousLetters, activeTileIndex);
          setActiveTileIndex(result.activeIndex);
          return result.letters;
        });
        setMessage("");
        setInvalidGuessId(0);
        return true;
      }

      if (key === "Delete") {
        setLetters((previousLetters) => {
          const result = clearGuessLetter(previousLetters, activeTileIndex);
          setActiveTileIndex(result.activeIndex);
          return result.letters;
        });
        setMessage("");
        setInvalidGuessId(0);
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
        setLetters((previousLetters) => {
          const result = setGuessLetter(previousLetters, activeTileIndex, normalizedKey);
          setActiveTileIndex(result.activeIndex);
          return result.letters;
        });
        setMessage("");
        setInvalidGuessId(0);
        return true;
      }

      return false;
    },
    [activeTileIndex, enabled, isRevealing, submit],
  );

  const selectTile = useCallback(
    (index: number) => {
      if (!enabled || isRevealing) {
        return;
      }

      setActiveTileIndex(clampTileIndex(index));
      setInvalidGuessId(0);
    },
    [enabled, isRevealing],
  );

  return {
    letters,
    activeTileIndex,
    isRevealing,
    message,
    messageId,
    invalidGuessId,
    selectTile,
    handleKey,
    clearMessage: useCallback(() => setMessage(""), []),
  };
}
