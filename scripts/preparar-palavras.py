from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_PATH = PROJECT_ROOT / "palavras-originais.txt"
DEFAULT_BLOCKLIST_PATH = PROJECT_ROOT / "scripts" / "blocklist.txt"
DEFAULT_CURATED_ANSWERS_PATH = PROJECT_ROOT / "scripts" / "answers-curadas.txt"
DEFAULT_VALID_OUTPUT_PATH = PROJECT_ROOT / "src" / "data" / "validWords.json"
DEFAULT_ANSWERS_OUTPUT_PATH = PROJECT_ROOT / "src" / "data" / "answers.json"
WORD_PATTERN = re.compile(r"^[^\W\d_]+$", re.UNICODE)
WORD_LENGTH = 5


@dataclass(frozen=True)
class CliOptions:
    input_path: Path
    blocklist_path: Path
    curated_answers_path: Path
    valid_output_path: Path
    answers_output_path: Path
    answers_limit: int | None


def normalize_word(word: str) -> str:
    lowered_word = word.strip().lower().replace("ç", "c")
    decomposed_word = unicodedata.normalize("NFD", lowered_word)
    return "".join(
        character
        for character in decomposed_word
        if unicodedata.category(character) != "Mn"
    )


def clean_line(line: str) -> str:
    stripped_line = line.strip()

    if stripped_line.startswith("#"):
        return ""

    return stripped_line


def is_valid_word(raw_word: str) -> bool:
    if raw_word != raw_word.strip():
        return False

    if WORD_PATTERN.fullmatch(raw_word) is None:
        return False

    return len(normalize_word(raw_word)) == WORD_LENGTH


def read_words(path: Path, *, required: bool) -> list[str]:
    if not path.exists():
        if required:
            sys.stderr.write(f"Arquivo nao encontrado: {path}\n")
            raise SystemExit(1)
        return []

    words = []

    for line in path.read_text(encoding="utf-8").splitlines():
        raw_word = clean_line(line)

        if raw_word == "":
            continue

        if is_valid_word(raw_word):
            words.append(normalize_word(raw_word))

    return words


def unique_sorted(words: list[str]) -> list[str]:
    return sorted(set(words))


def write_json(path: Path, words: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(words, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def select_answers(
    valid_words: list[str],
    curated_answers: list[str],
    answers_limit: int | None,
) -> list[str]:
    valid_word_set = set(valid_words)

    if curated_answers:
        answers = [word for word in unique_sorted(curated_answers) if word in valid_word_set]
    else:
        answers = valid_words

    if answers_limit is not None:
        answers = answers[:answers_limit]

    return answers


def parse_args() -> CliOptions:
    parser = argparse.ArgumentParser(
        description="Normaliza palavras PT-BR e gera os JSONs do Palavra Livre.",
    )
    parser.add_argument(
        "input_path",
        nargs="?",
        type=Path,
        default=DEFAULT_INPUT_PATH,
        help="Arquivo bruto com uma palavra por linha.",
    )
    parser.add_argument(
        "--blocklist",
        type=Path,
        default=DEFAULT_BLOCKLIST_PATH,
        help="Arquivo com palavras proibidas, uma por linha.",
    )
    parser.add_argument(
        "--curated-answers",
        type=Path,
        default=DEFAULT_CURATED_ANSWERS_PATH,
        help="Arquivo opcional com respostas curadas, uma por linha.",
    )
    parser.add_argument(
        "--valid-output",
        type=Path,
        default=DEFAULT_VALID_OUTPUT_PATH,
        help="Destino do validWords.json.",
    )
    parser.add_argument(
        "--answers-output",
        type=Path,
        default=DEFAULT_ANSWERS_OUTPUT_PATH,
        help="Destino do answers.json.",
    )
    parser.add_argument(
        "--answers-limit",
        type=int,
        default=None,
        help="Quantidade maxima de respostas.",
    )
    namespace = parser.parse_args()

    return CliOptions(
        input_path=namespace.input_path,
        blocklist_path=namespace.blocklist,
        curated_answers_path=namespace.curated_answers,
        valid_output_path=namespace.valid_output,
        answers_output_path=namespace.answers_output,
        answers_limit=namespace.answers_limit,
    )


def main() -> int:
    options = parse_args()

    if options.answers_limit is not None and options.answers_limit < 1:
        sys.stderr.write("--answers-limit precisa ser maior que zero.\n")
        return 1

    blocklist = set(read_words(options.blocklist_path, required=False))
    valid_words = [
        word
        for word in unique_sorted(read_words(options.input_path, required=True))
        if word not in blocklist
    ]
    curated_answers = [
        word
        for word in read_words(options.curated_answers_path, required=False)
        if word not in blocklist
    ]
    answers = select_answers(valid_words, curated_answers, options.answers_limit)

    if len(valid_words) == 0:
        sys.stderr.write("Nenhuma palavra valida de 5 letras foi encontrada.\n")
        return 1

    if len(answers) == 0:
        sys.stderr.write("Nenhuma resposta valida foi encontrada.\n")
        return 1

    write_json(options.valid_output_path, valid_words)
    write_json(options.answers_output_path, answers)
    sys.stdout.write(
        f"{len(valid_words)} palavras validas e {len(answers)} respostas gravadas.\n",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
