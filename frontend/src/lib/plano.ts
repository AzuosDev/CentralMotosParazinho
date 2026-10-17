import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { formatCurrency } from "./finance";

// Espelha getConfigStatus em backend/src/modules/billing/billing.service.ts. O preço é o
// que o admin definiu no Painel Admin (padrão ou próprio do cliente) — nenhuma tela fixa
// valor. Pagamento só por PIX.
export type BillingConfig = {
  pix: boolean;
  plano: { id: string; nome: string; valorMensal: number; valorAnual: number; personalizado: boolean };
};

export const PLANO_ID = "empresarial";
export const PLANO_NOME = "Plano Empresarial";

export function useBillingConfig() {
  return useQuery<BillingConfig>({
    queryKey: ["billing-config"],
    queryFn: async () => (await api.get<BillingConfig>("/api/billing/config")).data,
    staleTime: Infinity,
  });
}

export function precoPlano(config: BillingConfig | undefined, cycle: "monthly" | "annual"): string {
  if (!config) return "…";
  return formatCurrency(cycle === "annual" ? config.plano.valorAnual : config.plano.valorMensal);
}

// Quantos meses de mensalidade o anual economiza (ex.: 2 → "2 meses grátis").
export function mesesEconomizados(config: BillingConfig | undefined): number {
  if (!config || config.plano.valorMensal <= 0) return 0;
  return Math.floor((config.plano.valorMensal * 12 - config.plano.valorAnual) / config.plano.valorMensal);
}
