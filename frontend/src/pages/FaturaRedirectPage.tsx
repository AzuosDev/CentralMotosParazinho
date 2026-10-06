import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

// Ponte entre "essa conta pendente é uma fatura" (tela de Contas) e o detalhe do cartão:
// resolve o cartão dono da fatura e redireciona, sem exigir que o chamador já saiba o id
// do cartão.
export function FaturaRedirectPage() {
  const { faturaId } = useParams<{ faturaId: string }>();
  const navigate = useNavigate();

  const query = useQuery<{ cartaoId: string }>({
    queryKey: ["cartoes", "faturas", faturaId, "cartao"],
    queryFn: async () => {
      const { data } = await api.get<{ cartaoId: string }>(`/api/cartoes/faturas/${faturaId}/cartao`);
      return data;
    },
    enabled: !!faturaId,
    retry: false,
  });

  useEffect(() => {
    if (query.data?.cartaoId) {
      navigate(`/cartoes/${query.data.cartaoId}`, { replace: true });
    }
  }, [query.data, navigate]);

  if (query.isError) {
    return (
      <div className="rounded-2xl bg-bg-card p-8 text-center text-text-secondary">
        Não foi possível encontrar o cartão desta fatura.
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-bg-overlay border-t-accent-brand" />
    </div>
  );
}
