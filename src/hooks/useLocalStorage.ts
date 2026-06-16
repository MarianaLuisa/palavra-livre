import { useCallback, useState } from "react";

type SetValue<T> = T | ((previousValue: T) => T);

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: SetValue<T>) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }

    const item = window.localStorage.getItem(key);

    if (item === null) {
      return initialValue;
    }

    try {
      return JSON.parse(item) as T;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: SetValue<T>) => {
      setStoredValue((previousValue) => {
        const nextValue =
          value instanceof Function ? value(previousValue) : value;

        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(nextValue));
        }

        return nextValue;
      });
    },
    [key],
  );

  return [storedValue, setValue];
}
