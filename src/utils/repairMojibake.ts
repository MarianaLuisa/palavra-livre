const MOJIBAKE_MARKERS = /[ÃÂ]/;

const WINDOWS_1252_REVERSE_MAP = new Map<string, number>([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f],
]);

function markerCount(text: string): number {
  return [...text].filter((char) => char === "Ã" || char === "Â").length;
}

function toWindows1252Bytes(text: string): Uint8Array | null {
  const bytes: number[] = [];

  for (const char of text) {
    const code = char.charCodeAt(0);

    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }

    const mapped = WINDOWS_1252_REVERSE_MAP.get(char);

    if (mapped === undefined) {
      return null;
    }

    bytes.push(mapped);
  }

  return new Uint8Array(bytes);
}

function decodeAsUtf8(text: string): string | null {
  const bytes = toWindows1252Bytes(text);

  if (bytes === null) {
    return null;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function repairMojibake(text: string): string {
  let current = text;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!MOJIBAKE_MARKERS.test(current)) {
      break;
    }

    const decoded = decodeAsUtf8(current);

    if (
      decoded === null ||
      decoded === current ||
      decoded.includes("\uFFFD") ||
      markerCount(decoded) > markerCount(current)
    ) {
      break;
    }

    current = decoded;
  }

  return current;
}

export function repairMojibakeList(words: string[]): string[] {
  return words.map(repairMojibake);
}
