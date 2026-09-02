import { describe, expect, it } from "vitest";
import { normalizeChampionshipState, preserveVisibleBoardRows } from "./service";
import type { ChampionshipState } from "./types";

describe("Preservação e Normalização dos Tabuleiros", () => {
  const baseState: ChampionshipState = {
    now: "2026-09-02T12:00:00Z",
    championship: {
      id: "champ-1",
      name: "Campeonato Norte",
      championshipDate: "2026-09-02",
      timezone: "America/Sao_Paulo",
      registrationOpensAt: "2026-09-02T00:00:00Z",
      registrationClosesAt: "2026-09-02T23:59:59Z",
      startsAt: "2026-09-02T00:00:00Z",
      finishedAt: null,
      status: "IN_PROGRESS",
      participantCount: 1,
    },
    profile: null,
    participant: {
      id: "part-1",
      displayName: "Jogador 1",
      status: "IN_PROGRESS",
      registeredAt: "2026-09-02T10:00:00Z",
      startedAt: "2026-09-02T10:05:00Z",
      finishedAt: null,
      totalScore: 0,
      wordsSolved: 0,
      completedRounds: 0,
      totalAttempts: 0,
      totalDurationMs: 0,
      finalPosition: null,
    },
    rounds: [
      {
        id: "round-1",
        mode: "SIMPLE",
        roundOrder: 1,
        boardCount: 1,
        maxAttempts: 6,
        timeLimitSeconds: 0,
        unlocked: true,
        status: "IN_PROGRESS",
        attemptsUsed: 1,
        wordsSolved: 0,
        allWordsSolved: false,
        baseScore: 0,
        bonusScore: 0,
        totalScore: 0,
        durationMs: 1000,
        boards: [
          {
            boardIndex: 0,
            solved: false,
            answer: null,
            rows: [
              [
                { letter: "t", status: "correct" },
                { letter: "e", status: "present" },
                { letter: "r", status: "absent" },
                { letter: "m", status: "absent" },
                { letter: "o", status: "correct" },
              ],
            ],
          },
        ],
      },
    ],
    currentRoundId: "round-1",
  };

  it("preserva linhas avaliadas se a resposta subsequente do servidor vier sem linhas", () => {
    // Simula um RPC legado ou resposta parcial vazia
    const emptyIncomingState: ChampionshipState = {
      ...baseState,
      rounds: [
        {
          ...baseState.rounds[0],
          boards: [
            {
              boardIndex: 0,
              solved: false,
              answer: null,
              rows: [],
            },
          ],
        },
      ],
    };

    const preserved = preserveVisibleBoardRows(baseState, emptyIncomingState);
    expect(preserved.rounds[0].boards[0].rows).toHaveLength(1);
    expect(preserved.rounds[0].boards[0].rows[0][0].letter).toBe("t");
  });

  it("atualiza para novas linhas quando a resposta do servidor traz nova tentativa", () => {
    const updatedIncomingState: ChampionshipState = {
      ...baseState,
      rounds: [
        {
          ...baseState.rounds[0],
          attemptsUsed: 2,
          wordsSolved: 1,
          allWordsSolved: true,
          boards: [
            {
              boardIndex: 0,
              solved: true,
              answer: "TERNO",
              rows: [
                baseState.rounds[0].boards[0].rows[0],
                [
                  { letter: "t", status: "correct" },
                  { letter: "e", status: "correct" },
                  { letter: "r", status: "correct" },
                  { letter: "n", status: "correct" },
                  { letter: "o", status: "correct" },
                ],
              ],
            },
          ],
        },
      ],
    };

    const preserved = preserveVisibleBoardRows(baseState, updatedIncomingState);
    expect(preserved.rounds[0].boards[0].rows).toHaveLength(2);
    expect(preserved.rounds[0].boards[0].solved).toBe(true);
    expect(preserved.rounds[0].boards[0].answer).toBe("TERNO");
  });

  it("normaliza payload de estado mesmo com formatos heterogêneos de letras e tabuleiros", () => {
    const rawPayload = {
      now: "2026-09-02T12:00:00Z",
      championship: {
        id: "champ-1",
        name: "Campeonato Norte",
        status: "IN_PROGRESS",
      },
      rounds: [
        {
          round_id: "round-1",
          board_count: 1,
          max_attempts: 6,
          status: "IN_PROGRESS",
          boards: [
            {
              board_index: 0,
              is_solved: true,
              word: "PORTA",
              rows: [
                [
                  { letter: "P", status: "CORRECT" },
                  { letter: "O", status: "PRESENT" },
                  { letter: "R", status: "ABSENT" },
                  { letter: "T", status: "CORRECT" },
                  { letter: "A", status: "CORRECT" },
                ],
              ],
            },
          ],
        },
      ],
    };

    const normalized = normalizeChampionshipState(rawPayload);
    expect(normalized.rounds[0].id).toBe("round-1");
    expect(normalized.rounds[0].boards[0].solved).toBe(true);
    expect(normalized.rounds[0].boards[0].answer).toBe("PORTA");
    expect(normalized.rounds[0].boards[0].rows).toHaveLength(1);
    expect(normalized.rounds[0].boards[0].rows[0][0]).toEqual({
      letter: "p",
      status: "correct",
    });
  });

  it("elimina tentativas duplicadas da mesma palavra no mesmo tabuleiro (deduplicação defensiva)", () => {
    const rawPayloadWithDuplicates = {
      now: "2026-09-02T12:00:00Z",
      championship: {
        id: "champ-1",
        status: "IN_PROGRESS",
      },
      rounds: [
        {
          id: "round-dueto",
          boards: [
            {
              boardIndex: 0,
              rows: [
                [
                  { letter: "a", status: "present" },
                  { letter: "r", status: "present" },
                  { letter: "e", status: "absent" },
                  { letter: "i", status: "absent" },
                  { letter: "o", status: "correct" },
                ],
                // Linha duplicada da mesma palavra "AREIO"
                [
                  { letter: "a", status: "present" },
                  { letter: "r", status: "present" },
                  { letter: "e", status: "absent" },
                  { letter: "i", status: "absent" },
                  { letter: "o", status: "absent" },
                ],
                [
                  { letter: "c", status: "absent" },
                  { letter: "u", status: "absent" },
                  { letter: "l", status: "absent" },
                  { letter: "p", status: "absent" },
                  { letter: "a", status: "present" },
                ],
                // Linha duplicada da mesma palavra "CULPA"
                [
                  { letter: "c", status: "present" },
                  { letter: "u", status: "absent" },
                  { letter: "l", status: "absent" },
                  { letter: "p", status: "absent" },
                  { letter: "a", status: "correct" },
                ],
              ],
            },
          ],
        },
      ],
    };

    const normalized = normalizeChampionshipState(rawPayloadWithDuplicates);
    // As 4 linhas devem ser deduplicadas para exatamente 2 palavras ("areio" e "culpa")
    expect(normalized.rounds[0].boards[0].rows).toHaveLength(2);
    expect(normalized.rounds[0].boards[0].rows[0].map((l) => l.letter).join("")).toBe("areio");
    expect(normalized.rounds[0].boards[0].rows[1].map((l) => l.letter).join("")).toBe("culpa");
  });
});
