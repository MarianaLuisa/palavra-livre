from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = PROJECT_ROOT / "word-sources"
DEFAULT_INPUT_PATH = PROJECT_ROOT / "palavras-originais.txt"
DEFAULT_BLOCKLIST_PATH = PROJECT_ROOT / "scripts" / "blocklist.txt"
DEFAULT_CURATED_ANSWERS_PATH = PROJECT_ROOT / "scripts" / "answers-curadas.txt"
DEFAULT_VALID_OUTPUT_PATH = PROJECT_ROOT / "src" / "data" / "validWords.json"
DEFAULT_ANSWERS_OUTPUT_PATH = PROJECT_ROOT / "src" / "data" / "answers.json"
WORD_PATTERN = re.compile(r"^[^\W\d_]+$", re.UNICODE)
WORD_LENGTH = 5


@dataclass(frozen=True)
class CliOptions:
    source_paths: list[Path]
    source_dir: Path
    blocklist_path: Path
    curated_answers_path: Path
    valid_output_path: Path
    answers_output_path: Path
    answers_limit: int | None
    max_answer_icf: float


@dataclass(frozen=True)
class WordBuildResult:
    valid_words: list[str]
    answers: list[str]
    removed_by_filter: int
    removed_by_blocklist: int


def normalize_word(word: str) -> str:
    lowered_word = word.strip().lower().replace("ç", "c")
    decomposed_word = unicodedata.normalize("NFD", lowered_word)
    return "".join(
        character
        for character in decomposed_word
        if unicodedata.category(character) != "Mn"
    )


def strip_comment(line: str) -> str:
    return line.split("#", 1)[0].strip()


def candidate_from_token(token: str) -> str:
    cleaned_token = token.strip()

    if "," in cleaned_token:
        possible_word, possible_score = cleaned_token.split(",", 1)

        if possible_score.replace(".", "", 1).isdigit():
            cleaned_token = possible_word

    if "/" in cleaned_token:
        cleaned_token = cleaned_token.split("/", 1)[0]

    return cleaned_token


def is_valid_raw_word(raw_word: str) -> bool:
    if raw_word == "" or raw_word != raw_word.strip():
        return False

    if WORD_PATTERN.fullmatch(raw_word) is None:
        return False

    return len(normalize_word(raw_word)) == WORD_LENGTH


def source_paths_from_options(options: CliOptions) -> list[Path]:
    if options.source_paths:
        return options.source_paths

    paths: list[Path] = []

    if options.source_dir.exists():
        paths.extend(
            path
            for path in sorted(options.source_dir.iterdir())
            if path.is_file() and path.suffix.lower() not in {".md", ".markdown"}
        )

    if not paths and DEFAULT_INPUT_PATH.exists():
        paths.append(DEFAULT_INPUT_PATH)

    return paths


def read_words_from_file(path: Path) -> tuple[set[str], int]:
    words: set[str] = set()
    removed_by_filter = 0

    for token in path.read_text(encoding="utf-8").split():
        raw_word = candidate_from_token(token)

        if not is_valid_raw_word(raw_word):
            removed_by_filter += 1
            continue

        words.add(normalize_word(raw_word))

    return words, removed_by_filter


def read_manual_word_file(path: Path) -> set[str]:
    if not path.exists():
        return set()

    words: set[str] = set()

    for line in path.read_text(encoding="utf-8").splitlines():
        raw_word = strip_comment(line)

        if raw_word == "":
            continue

        if is_valid_raw_word(raw_word):
            words.add(normalize_word(raw_word))

    return words


def read_icf_scores(paths: list[Path]) -> dict[str, float]:
    scores: dict[str, float] = {}

    for path in paths:
        for line in path.read_text(encoding="utf-8").splitlines():
            if "," not in line:
                continue

            raw_word, raw_score = line.split(",", 1)
            raw_word = raw_word.strip()
            raw_score = raw_score.strip()

            if not is_valid_raw_word(raw_word):
                continue

            try:
                score = float(raw_score)
            except ValueError:
                continue

            normalized_word = normalize_word(raw_word)
            scores[normalized_word] = min(score, scores.get(normalized_word, score))

    return scores


def is_good_answer_candidate(word: str) -> bool:
    uncommon_endings = (
        "aes",
        "oes",
        "ais",
        "eis",
        "eis",
        "des",
        "mos",
        "ram",
        "rei",
        "ria",
        "sse",
    )

    if word.endswith(uncommon_endings):
        return False

    if len(set(word)) < 3:
        return False

    return True


def write_json(path: Path, words: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(words, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def build_words(options: CliOptions) -> WordBuildResult:
    source_paths = source_paths_from_options(options)

    if not source_paths:
        sys.stderr.write(
            "Nenhuma fonte encontrada. Coloque arquivos em word-sources/ ou informe caminhos.\n",
        )
        raise SystemExit(1)

    all_words: set[str] = set()
    removed_by_filter = 0

    for source_path in source_paths:
        words, removed = read_words_from_file(source_path)
        all_words.update(words)
        removed_by_filter += removed

    blocklist = read_manual_word_file(options.blocklist_path)
    removed_by_blocklist = len(all_words & blocklist)
    valid_words = sorted(all_words - blocklist)
    valid_word_set = set(valid_words)
    icf_scores = read_icf_scores(source_paths)
    curated_answers = [
        word
        for word in sorted(read_manual_word_file(options.curated_answers_path))
        if word in valid_word_set and word not in blocklist
    ]
    automatic_answers = [
        word
        for word, score in sorted(icf_scores.items(), key=lambda item: (item[1], item[0]))
        if word in valid_word_set
        and word not in blocklist
        and score <= options.max_answer_icf
        and is_good_answer_candidate(word)
    ]

    if not automatic_answers:
        automatic_answers = [word for word in valid_words if is_good_answer_candidate(word)]

    answers = curated_answers + [
        word for word in automatic_answers if word not in set(curated_answers)
    ]

    if options.answers_limit is not None:
        answers = answers[: options.answers_limit]

    return WordBuildResult(
        valid_words=valid_words,
        answers=answers,
        removed_by_filter=removed_by_filter,
        removed_by_blocklist=removed_by_blocklist,
    )


def parse_args() -> CliOptions:
    parser = argparse.ArgumentParser(
        description="Normaliza fontes PT-BR e gera os JSONs do Palavra Livre.",
    )
    parser.add_argument(
        "source_paths",
        nargs="*",
        type=Path,
        help="Arquivos de origem. Se omitido, usa todos os arquivos em word-sources/.",
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help="Pasta com arquivos de fontes de palavras.",
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
    parser.add_argument(
        "--max-answer-icf",
        type=float,
        default=14.0,
        help="Pontuacao ICF maxima para respostas automaticas. Menor significa mais comum.",
    )
    namespace = parser.parse_args()

    return CliOptions(
        source_paths=namespace.source_paths,
        source_dir=namespace.source_dir,
        blocklist_path=namespace.blocklist,
        curated_answers_path=namespace.curated_answers,
        valid_output_path=namespace.valid_output,
        answers_output_path=namespace.answers_output,
        answers_limit=namespace.answers_limit,
        max_answer_icf=namespace.max_answer_icf,
    )


def main() -> int:
    options = parse_args()

    if options.answers_limit is not None and options.answers_limit < 1:
        sys.stderr.write("--answers-limit precisa ser maior que zero.\n")
        return 1

    result = build_words(options)

    if len(result.valid_words) == 0:
        sys.stderr.write("Nenhuma palavra valida de 5 letras foi encontrada.\n")
        return 1

    if len(result.answers) == 0:
        sys.stderr.write("Nenhuma resposta valida foi encontrada.\n")
        return 1

    write_json(options.valid_output_path, result.valid_words)
    write_json(options.answers_output_path, result.answers)
    sys.stdout.write(
        "\n".join(
            [
                f"Palavras validas: {len(result.valid_words)}",
                f"Respostas: {len(result.answers)}",
                f"Removidas por filtro: {result.removed_by_filter}",
                f"Removidas por blocklist: {result.removed_by_blocklist}",
            ],
        )
        + "\n",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
