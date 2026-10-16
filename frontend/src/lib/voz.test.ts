import { describe, expect, it } from "vitest";
import { ehCarteiraDinheiro, escolherMimeType,paraPayload, pendenciasDaLinha, rotuloData, type LinhaVoz } from "./voz";

const CARTAO = "cartao-1";
const isCartao = (id: string | null) => id === CARTAO;

function linha(over: Partial<LinhaVoz> = {}): LinhaVoz {
  return {
    chave: "l1",
    type: "EXPENSE",
    date: "2026-10-12",
    carteiraId: "conta-1",
    carteiraDestinoId: null,
    parcelas: 1,
    value: 45.9,
    description: "Mercado",
    categoryId: "cat-1",
    formaPagamento: null,
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

describe("ehCarteiraDinheiro", () => {
  it("reconhece pelo tipo ou pelo nome, nunca um cartão", () => {
    expect(ehCarteiraDinheiro({ tipo: "dinheiro", nome: "Carteira" })).toBe(true);
    expect(ehCarteiraDinheiro({ tipo: "conta", nome: "Dinheiro" })).toBe(true);
    expect(ehCarteiraDinheiro({ tipo: "conta", nome: "Espécie" })).toBe(true);
    expect(ehCarteiraDinheiro({ tipo: "conta", nome: "Itaú" })).toBe(false);
    expect(ehCarteiraDinheiro({ tipo: "credito", nome: "Cartão cash back" })).toBe(false);
  });
});

describe("escolherMimeType", () => {
  it("cai para mp4 no Safari", () => {
    expect(escolherMimeType((m) => m === "audio/mp4")).toBe("audio/mp4");
  });
});

describe("rotuloData", () => {
  it("usa palavras para os dias próximos e dd/mm para o resto", () => {
    expect(rotuloData("2026-10-13", "2026-10-13")).toBe("Hoje");
    expect(rotuloData("2026-10-12", "2026-10-13")).toBe("Ontem");
    expect(rotuloData("2026-10-14", "2026-10-13")).toBe("Amanhã");
    expect(rotuloData("2026-10-01", "2026-10-13")).toBe("01/10");
    expect(rotuloData("2025-12-31", "2026-01-01")).toBe("Ontem");
    expect(rotuloData("2025-12-20", "2026-01-01")).toBe("20/12/2025");
  });
});
