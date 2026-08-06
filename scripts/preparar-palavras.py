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
DEFAULT_ANSWER_BLOCKLIST_PATH = PROJECT_ROOT / "scripts" / "answer-blocklist.txt"
DEFAULT_CURATED_ANSWERS_PATH = PROJECT_ROOT / "scripts" / "answers-curadas.txt"
DEFAULT_TERMO_ANSWERS_PATH = PROJECT_ROOT / "word-sources" / "termo-respostas-historicas.txt"
DEFAULT_VALID_OUTPUT_PATH = PROJECT_ROOT / "src" / "data" / "validWords.json"
DEFAULT_ANSWERS_OUTPUT_PATH = PROJECT_ROOT / "src" / "data" / "answers.json"
WORD_PATTERN = re.compile(r"^[^\W\d_]+$", re.UNICODE)
WORD_LENGTH = 5
DEFAULT_ANSWERS_LIMIT: int | None = None
DEFAULT_MIN_ANSWERS = 1500
DEFAULT_MAX_ANSWER_ICF_SCORE = 17.0
DEFAULT_MIN_ANSWER_ZIPF_SCORE = 3.0
DEFAULT_EXTRA_VALID_ZIPF_SCORE = 4.0
DEFAULT_TERMO_MIN_ZIPF_SCORE = 3.5
DEFAULT_AUTOMATIC_ANSWERS_LIMIT = 1800
FSERB_LEXICON_NAMES = frozenset({"lexico", "fserb-pt-br-lexico.txt"})
FSERB_SOURCE_MARKERS = ("lexico", "verbos", "conjugacoes", "icf")
FREQUENCY_SOURCE_MARKERS = ("frequencywords", "frequencia", "frequency")
ANSWER_EXCLUSION_MARKERS = (
    "paises",
    "estadosbr",
    "municipiosbr",
    "continentes",
    "negativas",
)
ANSWER_ALLOWLIST_MARKERS = ("verbos",)
ANSWER_REJECTED_LETTERS = frozenset("kwy")
ANSWER_REJECTED_ENDINGS = (
    "aes",
    "oes",
    "ais",
    "eis",
    "des",
    "mos",
    "ram",
    "rei",
    "ria",
    "sse",
    "ava",
    "iam",
    "ara",
    "era",
    "ira",
    "ou",
    "ei",
)


@dataclass(frozen=True)
class CliOptions:
    source_paths: list[Path]
    source_dir: Path
    blocklist_path: Path
    answer_blocklist_path: Path
    curated_answers_path: Path
    valid_output_path: Path
    answers_output_path: Path
    answers_limit: int | None
    min_answers: int
    max_answer_icf_score: float
    min_answer_zipf_score: float


@dataclass(frozen=True)
class WordBuildResult:
    valid_words: list[str]
    answers: list[str]
    removed_by_filter: int
    removed_by_blocklist: int


@dataclass(frozen=True)
class AffixRule:
    kind: str
    flag: str
    strip: str
    add: str
    condition: re.Pattern[str]
    cross_product: bool


@dataclass(frozen=True)
class AffixRules:
    prefixes: dict[str, list[AffixRule]]
    suffixes: dict[str, list[AffixRule]]


def normalize_word(word: str) -> str:
    lowered_word = word.strip().lower().replace("ç", "c")
    decomposed_word = unicodedata.normalize("NFD", lowered_word)
    return "".join(
        character
        for character in decomposed_word
        if unicodedata.category(character) != "Mn"
    )


def display_word(word: str) -> str:
    return unicodedata.normalize("NFC", word.strip().lower())


def display_word_score(word: str) -> int:
    normalized_word = normalize_word(word)
    return sum(
        1
        for display_character, normalized_character in zip(word, normalized_word, strict=False)
        if display_character != normalized_character
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


def split_hunspell_token(token: str) -> tuple[str, str]:
    cleaned_token = token.strip()

    if "\t" in cleaned_token:
        cleaned_token = cleaned_token.split("\t", 1)[0]

    if "/" not in cleaned_token:
        return cleaned_token, ""

    raw_word, raw_flags = cleaned_token.split("/", 1)
    return raw_word, raw_flags


def is_valid_raw_word(raw_word: str) -> bool:
    if raw_word == "" or raw_word != raw_word.strip():
        return False

    if WORD_PATTERN.fullmatch(raw_word) is None:
        return False

    return len(normalize_word(raw_word)) == WORD_LENGTH


def normalized_path_key(path: Path) -> str:
    return normalize_word(path.name).replace("-", "").replace("_", "")


def is_fserb_lexicon_path(path: Path) -> bool:
    path_name = path.name.lower()
    return path_name in FSERB_LEXICON_NAMES or (
        "fserb" in path_name and "lexico" in normalized_path_key(path)
    )


def is_fserb_source_path(path: Path) -> bool:
    path_name = path.name.lower()
    path_key = normalized_path_key(path)
    looks_like_fserb = path_name in FSERB_LEXICON_NAMES or "fserb" in path_name

    return looks_like_fserb and any(marker in path_key for marker in FSERB_SOURCE_MARKERS)


def source_paths_from_options(options: CliOptions) -> list[Path]:
    if options.source_paths:
        return options.source_paths

    paths: list[Path] = []

    if options.source_dir.exists():
        fserb_paths = sorted(
            path
            for path in options.source_dir.iterdir()
            if path.is_file() and is_fserb_source_path(path)
        )

        if fserb_paths:
            return fserb_paths

        libreoffice_paths = sorted(
            path
            for path in options.source_dir.iterdir()
            if path.is_file()
            and path.suffix.lower() == ".dic"
            and (
                "libreoffice" in path.name.lower()
                or path.name.lower() == "pt_br.dic"
            )
        )

        if libreoffice_paths:
            return libreoffice_paths

        paths.extend(
            path
            for path in sorted(options.source_dir.iterdir())
            if path.is_file() and path.suffix.lower() not in {".md", ".markdown"}
        )

    if not paths and DEFAULT_INPUT_PATH.exists():
        paths.append(DEFAULT_INPUT_PATH)

    return paths


def answer_candidate_paths_from_options(
    options: CliOptions,
    fallback_paths: list[Path],
) -> list[Path]:
    if options.source_dir.exists():
        source_dir_lexicon_paths = sorted(
            path
            for path in options.source_dir.iterdir()
            if path.is_file() and is_fserb_lexicon_path(path)
        )

        if source_dir_lexicon_paths:
            return source_dir_lexicon_paths

    fallback_lexicon_paths = [path for path in fallback_paths if is_fserb_lexicon_path(path)]

    if fallback_lexicon_paths:
        return fallback_lexicon_paths

    return fallback_paths


def answer_exclusion_paths_from_options(options: CliOptions) -> list[Path]:
    if not options.source_dir.exists():
        return []

    return sorted(
        path
        for path in options.source_dir.iterdir()
        if path.is_file()
        and any(
            marker in normalize_word(path.stem).replace("-", "")
            for marker in ANSWER_EXCLUSION_MARKERS
        )
    )


def answer_allowlist_paths_from_options(options: CliOptions) -> list[Path]:
    if not options.source_dir.exists():
        return []

    return sorted(
        path
        for path in options.source_dir.iterdir()
        if path.is_file()
        and any(
            marker in normalize_word(path.stem).replace("-", "")
            for marker in ANSWER_ALLOWLIST_MARKERS
        )
    )


def curated_answer_paths_from_options(options: CliOptions) -> list[Path]:
    paths = [options.curated_answers_path]

    if DEFAULT_TERMO_ANSWERS_PATH.exists():
        paths.append(DEFAULT_TERMO_ANSWERS_PATH)

    return paths


def affix_paths_from_options(options: CliOptions) -> list[Path]:
    if not options.source_dir.exists():
        return []

    return sorted(
        path
        for path in options.source_dir.iterdir()
        if path.is_file()
        and path.suffix.lower() == ".aff"
        and (
            "libreoffice" in path.name.lower()
            or path.name.lower() == "pt_br.aff"
        )
    )


def score_paths_from_options(options: CliOptions) -> list[Path]:
    if not options.source_dir.exists():
        return []

    return sorted(
        path
        for path in options.source_dir.iterdir()
        if path.is_file()
        and path.suffix.lower() in {".csv", ".txt"}
        and "icf" in path.name.lower()
    )


def frequency_paths_from_options(options: CliOptions) -> list[Path]:
    if not options.source_dir.exists():
        return []

    return sorted(
        path
        for path in options.source_dir.iterdir()
        if path.is_file()
        and path.suffix.lower() in {".csv", ".txt"}
        and any(marker in normalized_path_key(path) for marker in FREQUENCY_SOURCE_MARKERS)
    )


def normalize_affix_part(value: str) -> str:
    cleaned_value = value.split("/", 1)[0]
    return "" if cleaned_value == "0" else cleaned_value


def compile_affix_condition(kind: str, raw_condition: str) -> re.Pattern[str]:
    pattern = "." if raw_condition == "0" else raw_condition

    if kind == "PFX":
        return re.compile(f"^{pattern}", re.UNICODE)

    return re.compile(f"{pattern}$", re.UNICODE)


def read_affix_rules(paths: list[Path]) -> AffixRules:
    prefixes: dict[str, list[AffixRule]] = {}
    suffixes: dict[str, list[AffixRule]] = {}
    cross_products: dict[tuple[str, str], bool] = {}

    for path in paths:
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped_line = strip_comment(line)

            if stripped_line == "":
                continue

            parts = stripped_line.split()

            if len(parts) < 4 or parts[0] not in {"PFX", "SFX"}:
                continue

            kind = parts[0]
            flag = parts[1]

            if len(parts) == 4 and parts[2] in {"Y", "N"}:
                cross_products[(kind, flag)] = parts[2] == "Y"
                continue

            if len(parts) < 5:
                continue

            try:
                condition = compile_affix_condition(kind, parts[4])
            except re.error:
                continue

            rule = AffixRule(
                kind=kind,
                flag=flag,
                strip=normalize_affix_part(parts[2]),
                add=normalize_affix_part(parts[3]),
                condition=condition,
                cross_product=cross_products.get((kind, flag), False),
            )

            if kind == "PFX":
                prefixes.setdefault(flag, []).append(rule)
            else:
                suffixes.setdefault(flag, []).append(rule)

    return AffixRules(prefixes=prefixes, suffixes=suffixes)


def apply_affix_rule(word: str, rule: AffixRule) -> str | None:
    if rule.condition.search(word) is None:
        return None

    if rule.kind == "PFX":
        if rule.strip and not word.startswith(rule.strip):
            return None

        return f"{rule.add}{word[len(rule.strip):]}"

    if rule.strip and not word.endswith(rule.strip):
        return None

    stem = word[: -len(rule.strip)] if rule.strip else word
    return f"{stem}{rule.add}"


def add_candidate(words: set[str], raw_word: str) -> bool:
    if not is_valid_raw_word(raw_word):
        return False

    words.add(normalize_word(raw_word))
    return True


def add_display_candidate(words: dict[str, str], raw_word: str) -> bool:
    if not is_valid_raw_word(raw_word):
        return False

    normalized_word = normalize_word(raw_word)
    candidate_word = display_word(raw_word)
    current_word = words.get(normalized_word)

    if current_word is None or display_word_score(candidate_word) > display_word_score(current_word):
        words[normalized_word] = candidate_word

    return True


def read_words_from_hunspell_dic(path: Path, affix_rules: AffixRules) -> tuple[set[str], int]:
    words: set[str] = set()
    removed_by_filter = 0

    for token in path.read_text(encoding="utf-8").split():
        raw_word, flags = split_hunspell_token(token)

        if not add_candidate(words, raw_word):
            removed_by_filter += 1

        prefix_rules = [
            rule
            for flag in flags
            for rule in affix_rules.prefixes.get(flag, [])
        ]
        suffix_rules = [
            rule
            for flag in flags
            for rule in affix_rules.suffixes.get(flag, [])
        ]

        for rule in prefix_rules + suffix_rules:
            inflected_word = apply_affix_rule(raw_word, rule)

            if inflected_word is not None:
                add_candidate(words, inflected_word)

        for prefix_rule in prefix_rules:
            if not prefix_rule.cross_product:
                continue

            prefixed_word = apply_affix_rule(raw_word, prefix_rule)

            if prefixed_word is None:
                continue

            for suffix_rule in suffix_rules:
                if not suffix_rule.cross_product:
                    continue

                suffixed_word = apply_affix_rule(prefixed_word, suffix_rule)

                if suffixed_word is not None:
                    add_candidate(words, suffixed_word)

    return words, removed_by_filter


def read_words_from_file(path: Path, affix_rules: AffixRules | None = None) -> tuple[set[str], int]:
    if path.suffix.lower() == ".dic" and affix_rules is not None:
        return read_words_from_hunspell_dic(path, affix_rules)

    words: set[str] = set()
    removed_by_filter = 0

    for token in path.read_text(encoding="utf-8").split():
        raw_word = candidate_from_token(token)

        if not add_candidate(words, raw_word):
            removed_by_filter += 1

    return words, removed_by_filter


def read_display_words_from_hunspell_dic(path: Path, affix_rules: AffixRules) -> dict[str, str]:
    words: dict[str, str] = {}

    for token in path.read_text(encoding="utf-8").split():
        raw_word, flags = split_hunspell_token(token)
        add_display_candidate(words, raw_word)

        prefix_rules = [
            rule
            for flag in flags
            for rule in affix_rules.prefixes.get(flag, [])
        ]
        suffix_rules = [
            rule
            for flag in flags
            for rule in affix_rules.suffixes.get(flag, [])
        ]

        for rule in prefix_rules + suffix_rules:
            inflected_word = apply_affix_rule(raw_word, rule)

            if inflected_word is not None:
                add_display_candidate(words, inflected_word)

        for prefix_rule in prefix_rules:
            if not prefix_rule.cross_product:
                continue

            prefixed_word = apply_affix_rule(raw_word, prefix_rule)

            if prefixed_word is None:
                continue

            for suffix_rule in suffix_rules:
                if not suffix_rule.cross_product:
                    continue

                suffixed_word = apply_affix_rule(prefixed_word, suffix_rule)

                if suffixed_word is not None:
                    add_display_candidate(words, suffixed_word)

    return words


def read_display_words_from_file(path: Path, affix_rules: AffixRules | None = None) -> dict[str, str]:
    if path.suffix.lower() == ".dic" and affix_rules is not None:
        return read_display_words_from_hunspell_dic(path, affix_rules)

    words: dict[str, str] = {}

    for token in path.read_text(encoding="utf-8").split():
        raw_word = candidate_from_token(token)
        add_display_candidate(words, raw_word)

    return words


def merge_display_words(target: dict[str, str], source: dict[str, str]) -> None:
    for normalized_word, candidate_word in source.items():
        current_word = target.get(normalized_word)

        if current_word is None or display_word_score(candidate_word) > display_word_score(current_word):
            target[normalized_word] = candidate_word


def read_base_words_from_file(path: Path) -> set[str]:
    words: set[str] = set()

    for token in path.read_text(encoding="utf-8").split():
        if path.suffix.lower() == ".dic":
            raw_word, _flags = split_hunspell_token(token)
        else:
            raw_word = candidate_from_token(token)

        if is_valid_raw_word(raw_word):
            words.add(normalize_word(raw_word))

    return words


def read_base_words_from_files(paths: list[Path]) -> set[str]:
    words: set[str] = set()

    for path in paths:
        words.update(read_base_words_from_file(path))

    return words


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


def read_frequency_ranks(paths: list[Path]) -> dict[str, int]:
    ranks: dict[str, int] = {}

    for path in paths:
        for index, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            stripped_line = strip_comment(line)

            if stripped_line == "":
                continue

            if "|" in stripped_line:
                _raw_rank, stripped_line = stripped_line.split("|", 1)

            raw_word = stripped_line.split(None, 1)[0]

            if not is_valid_raw_word(raw_word):
                continue

            normalized_word = normalize_word(raw_word)
            ranks[normalized_word] = min(index, ranks.get(normalized_word, index))

    return ranks


def read_frequency_display_words(paths: list[Path]) -> dict[str, str]:
    words: dict[str, str] = {}

    for path in paths:
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped_line = strip_comment(line)

            if stripped_line == "":
                continue

            if "|" in stripped_line:
                _raw_rank, stripped_line = stripped_line.split("|", 1)

            raw_word = stripped_line.split(None, 1)[0]

            if is_valid_raw_word(raw_word):
                words.setdefault(normalize_word(raw_word), display_word(raw_word))

    return words


def read_wordfreq_scores(words: dict[str, str]) -> dict[str, float]:
    try:
        from wordfreq import zipf_frequency
    except ImportError:
        return {}

    scores: dict[str, float] = {}

    for normalized_word, display_candidate in words.items():
        scores[normalized_word] = max(
            zipf_frequency(display_candidate, "pt", wordlist="best"),
            zipf_frequency(normalized_word, "pt", wordlist="best"),
        )

    return scores


def is_good_answer_candidate(word: str) -> bool:
    if any(letter in ANSWER_REJECTED_LETTERS for letter in word):
        return False

    if word.endswith(ANSWER_REJECTED_ENDINGS):
        return False

    if len(set(word)) < 3:
        return False

    return True


def answer_sort_key(
    word: str,
    frequency_ranks: dict[str, int],
    icf_scores: dict[str, float],
    wordfreq_scores: dict[str, float],
) -> tuple[float, int, int, float, str]:
    frequency_rank = frequency_ranks.get(word)
    wordfreq_score = wordfreq_scores.get(word, 0)
    icf_score = icf_scores.get(word, float("inf"))

    return (
        -wordfreq_score,
        0 if frequency_rank is not None else 1,
        frequency_rank if frequency_rank is not None else sys.maxsize,
        icf_score,
        word,
    )


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
    display_words: dict[str, str] = {}
    removed_by_filter = 0
    affix_rules = read_affix_rules(affix_paths_from_options(options))

    for source_path in source_paths:
        words, removed = read_words_from_file(source_path, affix_rules)
        all_words.update(words)
        merge_display_words(display_words, read_display_words_from_file(source_path, affix_rules))
        removed_by_filter += removed

    for curated_answer_path in curated_answer_paths_from_options(options):
        if not curated_answer_path.exists():
            continue

        words, removed = read_words_from_file(curated_answer_path, affix_rules)
        all_words.update(words)
        merge_display_words(
            display_words,
            read_display_words_from_file(curated_answer_path, affix_rules),
        )
        removed_by_filter += removed

    icf_scores = read_icf_scores(score_paths_from_options(options))
    frequency_paths = frequency_paths_from_options(options)
    frequency_ranks = read_frequency_ranks(frequency_paths)
    frequency_display_words = read_frequency_display_words(frequency_paths)

    blocklist = read_manual_word_file(options.blocklist_path)
    answer_blocklist = read_manual_word_file(options.answer_blocklist_path)
    removed_by_blocklist = len(all_words & blocklist)
    valid_words = sorted(all_words - blocklist)
    valid_word_set = set(valid_words)

    answer_candidate_paths = answer_candidate_paths_from_options(options, source_paths)
    answer_allowlist_paths = answer_allowlist_paths_from_options(options)
    answer_exclusions = read_base_words_from_files(answer_exclusion_paths_from_options(options))
    lexical_answer_candidates = (
        read_base_words_from_files(answer_candidate_paths)
        | read_base_words_from_files(answer_allowlist_paths)
    )
    answer_display_words: dict[str, str] = {}

    for answer_source_path in answer_candidate_paths + answer_allowlist_paths:
        merge_display_words(
            answer_display_words,
            read_display_words_from_file(answer_source_path, affix_rules),
        )

    score_candidates = valid_word_set - answer_exclusions

    for word in score_candidates:
        answer_display_words.setdefault(word, display_words.get(word, word))

    wordfreq_scores = read_wordfreq_scores({
        word: frequency_display_words.get(word, answer_display_words.get(word, word))
        for word in score_candidates
    })
    strong_frequency_candidates = {
        word
        for word in score_candidates
        if word in frequency_ranks
        and wordfreq_scores.get(word, 0) >= DEFAULT_EXTRA_VALID_ZIPF_SCORE
    }
    answer_candidates = (
        ((lexical_answer_candidates - answer_exclusions) & valid_word_set)
        | strong_frequency_candidates
    )

    manual_curated_answers = read_manual_word_file(options.curated_answers_path)
    termo_curated_answers = read_manual_word_file(DEFAULT_TERMO_ANSWERS_PATH)
    curated_answer_words = set(manual_curated_answers)

    curated_answer_words.update(
        word
        for word in termo_curated_answers
        if wordfreq_scores.get(word, 0) >= DEFAULT_TERMO_MIN_ZIPF_SCORE
    )

    curated_answers = [
        word
        for word in sorted(curated_answer_words)
        if word in valid_word_set
        and word not in answer_blocklist
    ]

    answers: list[str] = []
    seen_answers: set[str] = set()

    curated_answer_set = set(curated_answers)

    automatic_answers = sorted(
        (
            word
            for word in answer_candidates
            if word not in answer_blocklist
            and is_good_answer_candidate(word)
            and wordfreq_scores.get(word, 0) >= options.min_answer_zipf_score
        ),
        key=lambda word: answer_sort_key(word, frequency_ranks, icf_scores, wordfreq_scores),
    )[:DEFAULT_AUTOMATIC_ANSWERS_LIMIT]

    for word in curated_answers + automatic_answers:
        if word in answer_blocklist:
            continue

        if word in seen_answers:
            continue

        answers.append(frequency_display_words.get(word, answer_display_words.get(word, word)))
        seen_answers.add(word)

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
        "--answer-blocklist",
        type=Path,
        default=DEFAULT_ANSWER_BLOCKLIST_PATH,
        help="Arquivo com palavras proibidas apenas como respostas.",
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
        default=DEFAULT_ANSWERS_LIMIT,
        help="Quantidade maxima de respostas. Se omitido, nao limita.",
    )
    parser.add_argument(
        "--min-answers",
        type=int,
        default=DEFAULT_MIN_ANSWERS,
        help="Quantidade minima de respostas esperada na lista final.",
    )
    parser.add_argument(
        "--max-answer-icf-score",
        type=float,
        default=DEFAULT_MAX_ANSWER_ICF_SCORE,
        help=(
            "Pontuacao ICF maxima para respostas automaticas. "
            "Valores menores priorizam palavras mais comuns."
        ),
    )
    parser.add_argument(
        "--min-answer-zipf-score",
        type=float,
        default=DEFAULT_MIN_ANSWER_ZIPF_SCORE,
        help=(
            "Pontuacao Zipf minima do wordfreq para respostas que nao aparecem na lista "
            "frequencywords. Valores maiores deixam as respostas mais comuns."
        ),
    )
    namespace = parser.parse_args()

    return CliOptions(
        source_paths=namespace.source_paths,
        source_dir=namespace.source_dir,
        blocklist_path=namespace.blocklist,
        answer_blocklist_path=namespace.answer_blocklist,
        curated_answers_path=namespace.curated_answers,
        valid_output_path=namespace.valid_output,
        answers_output_path=namespace.answers_output,
        answers_limit=namespace.answers_limit,
        min_answers=namespace.min_answers,
        max_answer_icf_score=namespace.max_answer_icf_score,
        min_answer_zipf_score=namespace.min_answer_zipf_score,
    )


def main() -> int:
    options = parse_args()

    if options.answers_limit is not None and options.answers_limit < 1:
        sys.stderr.write("--answers-limit precisa ser maior que zero.\n")
        return 1

    if options.min_answers < 1:
        sys.stderr.write("--min-answers precisa ser maior que zero.\n")
        return 1

    if options.max_answer_icf_score < 0:
        sys.stderr.write("--max-answer-icf-score nao pode ser negativo.\n")
        return 1

    if options.min_answer_zipf_score < 0:
        sys.stderr.write("--min-answer-zipf-score nao pode ser negativo.\n")
        return 1

    result = build_words(options)

    if len(result.valid_words) == 0:
        sys.stderr.write("Nenhuma palavra valida de 5 letras foi encontrada.\n")
        return 1

    if len(result.answers) == 0:
        sys.stderr.write("Nenhuma resposta valida foi encontrada.\n")
        return 1

    minimum_answers = (
        min(options.min_answers, options.answers_limit)
        if options.answers_limit is not None
        else options.min_answers
    )

    if len(result.answers) < minimum_answers:
        sys.stderr.write(
            f"Foram geradas apenas {len(result.answers)} respostas; minimo esperado: {minimum_answers}.\n",
        )
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
