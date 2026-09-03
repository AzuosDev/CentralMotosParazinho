import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2 } from "lucide-react";

import { api } from "../../lib/api";
import { getApiErrorMessages } from "../../lib/errors";
import { useToast } from "../ui/Toast";
import { ModalShell } from "./ModalShell";
import type { Cartao } from "../../types/api";

type TemplateLike = {
  id: string;
  title: string;
};

export function VincularRecorrenteModal({
  open,
  onClose,
  template,
}: {
  open: boolean;
  onClose: () => void;
  template: TemplateLike | null;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [carteiraId, setCarteiraId] = useState("");

  useEffect(() => {
    if (open) setCarteiraId("");
  }, [open, template]);

  const cartoesQuery = useQuery<Cartao[]>({
    queryKey: ["cartoes"],
    queryFn: async () => {
      const { data } = await api.get<Cartao[]>("/api/cartoes");
      return Array.isArray(data) ? data : [];
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post("/api/cartoes/vincular-recorrente", {
        templateId: template?.id,
        carteiraId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      addToast("Assinatura vinculada ao cartão. As próximas cobranças entram na fatura automaticamente.", "success");
      onClose();
    },
    onError: (error) => {
      addToast(getApiErrorMessages(error, "Não foi possível vincular esta assinatura ao cartão.")[0], "error");
    },
  });

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Vincular a um cartão"
      icon={<CreditCard className="h-6 w-6 text-accent-lime" />}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-white transition hover:bg-bg-overlay disabled:opacity-70"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !carteiraId}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-lime px-5 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-70"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Vincular
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          A partir de agora, <span className="font-semibold text-white">"{template?.title}"</span> é cobrada
          automaticamente no cartão escolhido todo mês, na fatura do ciclo certo — sem precisar marcar como paga
          manualmente. Isso vale só pra cobranças a partir de hoje; meses já pagos não mudam.
        </p>

        <div>
          <span className="mb-2 block text-sm text-text-secondary">Cartão</span>
          {cartoesQuery.isLoading ? (
            <div className="h-12 animate-pulse rounded-xl bg-bg-muted" />
          ) : (cartoesQuery.data ?? []).length === 0 ? (
            <p className="rounded-xl bg-yellow-500/10 p-3 text-sm text-yellow-400">
              Você ainda não tem nenhum cartão cadastrado.
            </p>
          ) : (
            <select
              value={carteiraId}
              onChange={(e) => setCarteiraId(e.target.value)}
              className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none transition focus:border-accent-lime"
            >
              <option value="">Selecione…</option>
              {(cartoesQuery.data ?? []).map((c) => (
                <option key={c._id} value={c._id}>{c.nome}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
