import { describe, expect, it } from "vitest";
import {
  ChampionshipError,
  describeServerError,
  getErrorMessage,
  isDateTakenError,
  isMissingFunctionError,
  toChampionshipError,
} from "./errors";

/**
 * O frontend nunca pode engolir a causa real de um erro do servidor.
 *
 * Estes testes travam o comportamento que faltava quando cd_submit_attempt
 * devolvia 400: a mensagem e o SQLSTATE do Postgres precisam sobreviver ate
 * a interface, em vez de virarem "algo deu errado".
 */
describe("toChampionskipError - corpo do PostgREST", () => {
  it("reconhece o codigo de regra e ainda guarda o erro cru", () => {
    const error = toChampionshipError(
      {
        code: "P0001",
        message: "WORD_NOT_ACCEPTED",
        details: null,
        hint: null,
      },
      400,
    );

    expect(error.code).toBe("WORD_NOT_ACCEPTED");
    expect(error.server?.code).toBe("P0001");
    expect(error.server?.message).toBe("WORD_NOT_ACCEPTED");
    expect(error.server?.status).toBe(400);
  });

  it("preserva a causa de um erro do Postgres que nao sabemos traduzir", () => {
    const error = toChampionshipError(
      {
        code: "42702",
        message: 'column reference "evaluation" is ambiguous',
        details: "It could refer to either a PL/pgSQL variable or a table column.",
        hint: null,
      },
      400,
    );

    expect(error.code).toBe("UNKNOWN");
    expect(error.server?.code).toBe("42702");
    expect(error.server?.message).toContain("ambiguous");
    expect(error.server?.details).toContain("PL/pgSQL");
  });

  it("reconhece os codigos que antes ficavam sem traducao", () => {
    expect(toChampionshipError({ message: "GUESS_LENGTH_MISMATCH" }).code).toBe(
      "GUESS_LENGTH_MISMATCH",
    );
    expect(toChampionshipError({ message: "INVALID_SCORE_INPUT" }).code).toBe(
      "INVALID_SCORE_INPUT",
    );
  });

  it("le o envelope de diagnostico do servidor", () => {
    const error = toChampionshipError(
      {
        code: "P0001",
        message: 'ATTEMPT_FAILED [22P02] invalid input syntax for type integer: "x"',
      },
      400,
    );

    expect(error.code).toBe("ATTEMPT_FAILED");
    expect(error.server?.message).toContain("22P02");
  });

  it("aceita string simples e Error", () => {
    expect(toChampionshipError("NOT_REGISTERED").code).toBe("NOT_REGISTERED");
    expect(toChampionshipError(new Error("DUPLICATE_ATTEMPT")).code).toBe(
      "DUPLICATE_ATTEMPT",
    );
  });

  it("nao reembrulha um ChampionshipError", () => {
    const original = new ChampionshipError("NO_ATTEMPTS_LEFT");
    expect(toChampionshipError(original)).toBe(original);
  });
});

describe("getErrorMessage", () => {
  it("usa a mensagem amigavel para erros de regra conhecidos", () => {
    const message = getErrorMessage({ code: "P0001", message: "WORD_NOT_ACCEPTED" });

    expect(message).toBe("Essa palavra não é aceita.");
    // Erro de regra nao polui a tela com detalhe tecnico.
    expect(message).not.toContain("P0001");
  });

  it("mostra a causa real quando nao sabemos traduzir", () => {
    const message = getErrorMessage({
      code: "42702",
      message: 'column reference "evaluation" is ambiguous',
    });

    // A pessoa continua vendo uma frase em portugues...
    expect(message).toContain("Algo deu errado");
    // ...mas a causa real deixa de ficar escondida.
    expect(message).toContain("42702");
    expect(message).toContain("ambiguous");
  });

  it("mostra o SQLSTATE original dentro de ATTEMPT_FAILED", () => {
    const message = getErrorMessage({
      code: "P0001",
      message: "ATTEMPT_FAILED [23514] new row violates check constraint",
    });

    expect(message).toContain("A tentativa não pôde ser registrada.");
    expect(message).toContain("23514");
  });

  it("trunca detalhes muito longos", () => {
    const message = getErrorMessage({
      code: "XX000",
      message: "e".repeat(600),
    });

    expect(message.length).toBeLessThanOrEqual(320);
    expect(message).toContain("...");
  });
});

describe("describeServerError", () => {
  it("junta codigo, mensagem e dica", () => {
    expect(
      describeServerError({ code: "42883", message: "function does not exist", hint: "tente outra" }),
    ).toBe("42883 · function does not exist · tente outra");
  });

  it("devolve null quando nao ha nada util", () => {
    expect(describeServerError(undefined)).toBeNull();
    expect(describeServerError({ status: 400 })).toBeNull();
  });
});

describe("Migration pendente e colisao de data", () => {
  it("reconhece funcao ausente no schema cache do PostgREST", () => {
    const error = toChampionshipError(
      {
        code: "PGRST202",
        message:
          "Could not find the function public.cd_admin_create_next_championship without parameters in the schema cache",
        hint: "Perhaps you meant to call the function public.cd_admin_create_championship",
      },
      404,
    );

    expect(error.code).toBe("FUNCTION_NOT_DEPLOYED");
    expect(isMissingFunctionError(error.server)).toBe(true);
  });

  it("explica que faltam migrations em vez de dizer so que algo deu errado", () => {
    const message = getErrorMessage({
      code: "PGRST202",
      message: "Could not find the function public.cd_admin_create_next_championship",
    });

    expect(message).toContain("supabase db push");
    expect(message).not.toContain("Algo deu errado");
  });

  it("reconhece colisao de data nas duas versoes da funcao", () => {
    // Versao nova: erro de regra ja traduzido.
    expect(isDateTakenError({ code: "P0001", message: "CHAMPIONSHIP_DATE_TAKEN" })).toBe(true);

    // Versao antiga: constraint crua do Postgres.
    expect(
      isDateTakenError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "championships_one_official_per_date"',
      }),
    ).toBe(true);

    expect(isDateTakenError({ code: "P0001", message: "FORBIDDEN" })).toBe(false);
  });

  it("nao confunde funcao ausente com outros erros", () => {
    expect(isMissingFunctionError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingFunctionError(undefined)).toBe(false);
  });
});
