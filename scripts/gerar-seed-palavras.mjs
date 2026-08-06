#!/usr/bin/env node
// Gera supabase/seed/palavras.sql a partir de src/data/*.json.
// O banco precisa ter a mesma base do jogo livre para validar tentativas
// e sortear respostas do Campeonato Diario no servidor.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(rootDir, "supabase/seed/palavras.sql");

function normalizeWord(word) {
  return word
    .trim()
    .toLowerCase()
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(rootDir, relativePath), "utf8"));
}

function quote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const validWords = readJson("src/data/validWords.json");
const answers = readJson("src/data/answers.json");

const normalizedValidWords = [
  ...new Set(
    validWords.map(normalizeWord).filter((word) => /^[a-z]{5}$/.test(word)),
  ),
].sort();

const answerEntries = [
  ...new Map(
    answers
      .map((word) => [normalizeWord(word), word.trim().toLowerCase()])
      .filter(([normalized]) => /^[a-z]{5}$/.test(normalized)),
  ).entries(),
].sort(([left], [right]) => left.localeCompare(right));

// Toda resposta precisa ser aceita como tentativa.
const validWordSet = new Set(normalizedValidWords);
const missingFromValid = answerEntries
  .map(([normalized]) => normalized)
  .filter((word) => !validWordSet.has(word));

for (const word of missingFromValid) {
  normalizedValidWords.push(word);
}
normalizedValidWords.sort();

const lines = [
  "-- Arquivo gerado por scripts/gerar-seed-palavras.mjs. Nao edite a mao.",
  "-- Fonte: src/data/validWords.json e src/data/answers.json.",
  "",
  "begin;",
  "",
  "truncate table championship_valid_words;",
  "truncate table championship_word_pool;",
  "",
];

for (const group of chunk(normalizedValidWords, 500)) {
  lines.push("insert into championship_valid_words (normalized_word) values");
  lines.push(group.map((word) => `  (${quote(word)})`).join(",\n") + ";");
  lines.push("");
}

for (const group of chunk(answerEntries, 500)) {
  lines.push("insert into championship_word_pool (normalized_word, display_word) values");
  lines.push(
    group
      .map(([normalized, display]) => `  (${quote(normalized)}, ${quote(display)})`)
      .join(",\n") + ";",
  );
  lines.push("");
}

lines.push("commit;");
lines.push("");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, lines.join("\n"), "utf8");

console.log(`Seed gerado em supabase/seed/palavras.sql`);
console.log(`  tentativas aceitas: ${normalizedValidWords.length}`);
console.log(`  respostas sorteaveis: ${answerEntries.length}`);
if (missingFromValid.length > 0) {
  console.log(`  respostas adicionadas a lista de aceitas: ${missingFromValid.length}`);
}
