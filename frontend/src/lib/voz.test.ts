import { describe, expect, it } from "vitest";
import { escolherMimeType, linhaEmBranco, paraPayload, pendenciasDaLinha, trocarTipo, type LinhaVoz } from "./voz";

const CARTAO = "cartao-1";
const isCartao = (id: string | null) => id === CARTAO;

function linha(over: Partial<LinhaVoz> = {}): LinhaVoz {
  return {
    ...linhaEmBranco("2026-10-12", "conta-1"),
    value: 45.9,
    description: "Mercado",
    categoryId: "cat-1",
    ...over,
  };
}

describe("pendenciasDaLinha", () => {
  it("gasto completo está pronto", () => {
    expect(pendenciasDaLinha(linha(), isCartao)).toEqual([]);
  });

  it("gasto exige valor, carteira e categoria", () => {
    expect(pendenciasDaLinha(linha({ value: null, carteiraId: null, categoryId: null }), isCartao)).toEqual([
      "valor",
      "carteira",
      "categoria",
    ]);
  });

  it("ganho não exige categoria, mas não pode ir para cartão", () => {
    expect(pendenciasDaLinha(linha({ type: "INCOME", categoryId: null }), isCartao)).toEqual([]);
    expect(pendenciasDaLinha(linha({ type: "INCOME", carteiraId: CARTAO }), isCartao)).toHaveLength(1);
  });

  it("transferência exige origem e destino diferentes", () => {
    expect(pendenciasDaLinha(linha({ type: "TRANSFER", carteiraDestinoId: null }), isCartao)).toEqual([
      "carteira de destino",
    ]);
    expect(pendenciasDaLinha(linha({ type: "TRANSFER", carteiraDestinoId: "conta-1" }), isCartao)).toEqual([
      "carteiras diferentes",
    ]);
  });
});

describe("paraPayload", () => {
  it("só manda parcelas e confirmarMesmoAssim em compra no cartão", () => {
    expect(paraPayload(linha({ parcelas: 3, confirmarMesmoAssim: true }), isCartao)).toMatchObject({
      parcelas: undefined,
      confirmarMesmoAssim: undefined,
    });
    expect(paraPayload(linha({ carteiraId: CARTAO, parcelas: 3, confirmarMesmoAssim: true }), isCartao)).toMatchObject({
      parcelas: 3,
      confirmarMesmoAssim: true,
    });
  });

  it("transferência não manda categoria", () => {
    const payload = paraPayload(linha({ type: "TRANSFER", carteiraDestinoId: "conta-2" }), isCartao);
    expect(payload).not.toHaveProperty("categoryId");
    expect(payload).toMatchObject({ carteiraId: "conta-1", carteiraDestinoId: "conta-2" });
  });
});

describe("trocarTipo", () => {
  it("limpa a categoria, que é específica de gasto ou ganho", () => {
    expect(trocarTipo(linha(), "INCOME")).toMatchObject({ type: "INCOME", categoryId: null });
  });
});

describe("escolherMimeType", () => {
  it("cai para mp4 no Safari", () => {
    expect(escolherMimeType((m) => m === "audio/mp4")).toBe("audio/mp4");
  });
});
