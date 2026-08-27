import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseCurrencyInput, isPastMonth } from "./finance";

describe("parseCurrencyInput", () => {
  it("converte string com ponto decimal (retorno de type=number)", () => {
    expect(parseCurrencyInput("579.69")).toBe(579.69);
  });

  it("não multiplica por 100 (regressão do bug [^\\.\\d,-])", () => {
    expect(parseCurrencyInput("579.69")).not.toBe(57969);
  });

  it("aceita vírgula como separador decimal (locale pt-BR)", () => {
    expect(parseCurrencyInput("579,69")).toBe(579.69);
  });

  it("preserva valores inteiros", () => {
    expect(parseCurrencyInput("1000")).toBe(1000);
  });

  it("retorna 0 para entrada vazia ou inválida", () => {
    expect(parseCurrencyInput("")).toBe(0);
    expect(parseCurrencyInput("abc")).toBe(0);
  });
});

// "hoje" fixo: 2026-07-01 (mês 6, índice 0-based)
describe("isPastMonth", () => {
  beforeEach(() => vi.setSystemTime(new Date("2026-07-01T12:00:00")));
  afterEach(() => vi.useRealTimers());

  it("mês atual → false", () => {
    expect(isPastMonth("2026-07-15")).toBe(false);
  });

  it("mês passado → true", () => {
    expect(isPastMonth("2026-06-10")).toBe(true);
  });

  it("mês futuro → false", () => {
    expect(isPastMonth("2026-08-01")).toBe(false);
  });

  it("último dia do mês passado → true", () => {
    expect(isPastMonth("2026-06-30")).toBe(true);
  });

  it("primeiro dia do mês atual → false", () => {
    expect(isPastMonth("2026-07-01")).toBe(false);
  });

  it("string vazia → false", () => {
    expect(isPastMonth("")).toBe(false);
  });
});
