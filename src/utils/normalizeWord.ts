export function normalizeWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
