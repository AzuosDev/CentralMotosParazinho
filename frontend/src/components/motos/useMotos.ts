import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api";
import type { Moto } from "../../types/api";

/**
 * Lista completa de motos (estoque e vendidas), compartilhada pelo seletor de vínculo do
 * formulário de transação, pelo badge do TxRow e pelo filtro da lista de transações — uma
 * consulta só no cache ["motos"]. Quem mostra o quê é decidido em cada lugar: o MotoField
 * oferece as em estoque, mas uma vendida ainda aparece quando já é a moto vinculada (ou
 * vem pré-selecionada pela ficha dela), porque gasto atrasado de moto vendida existe
 * (documentação, garantia) e continua entrando no custo.
 */
export function useMotos() {
  return useQuery<Moto[]>({
    queryKey: ["motos"],
    queryFn: async () => {
      const { data } = await api.get<Moto[]>("/api/motos");
      return Array.isArray(data) ? data : [];
    },
  });
}
