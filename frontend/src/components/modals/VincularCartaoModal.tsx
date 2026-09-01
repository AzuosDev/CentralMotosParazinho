import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2 } from "lucide-react";

import { api } from "../../lib/api";
import { getApiErrorMessages } from "../../lib/errors";
import { useToast } from "../ui/Toast";
import { ModalShell } from "./ModalShell";
import type { Cartao } from "../../types/api";

type PendingLike = {
  id: string;
  title: string;
  isParcelada?: boolean;
  parcelas?: { totalParcelas?: number; parcelasPagas?: number[] };
};

export function VincularCartaoModal({
  open,
  onClose,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  pending: PendingLike | null;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [carteiraId, setCarteiraId] = useState("");
  const [parcelasJaPagas, setParcelasJaPagas] = useState("0");
  const [parcelasRestantes, setParcelasRestantes] = useState("1");

  useEffect(() => {
    if (open && pending) {
      setCarteiraId("");
      const jaPagas = pending.parcelas?.parcelasPagas?.length ?? 0;
      const total = pending.parcelas?.totalParcelas ?? jaPagas + 1;
      setParcelasJaPagas(String(jaPagas));
      setParcelasRestantes(String(Math.max(1, total - jaPagas)));
    }
  }, [open, pending]);

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
      await api.post("/api/cartoes/vincular-conta-pendente", {
        pendingAccountId: pending?.id,
        carteiraId,
        parcelasJaPagas: Number(parcelasJaPagas),
        parcelasRestantes: Number(parcelasRestantes),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast("Conta vinculada ao cartão com sucesso.", "success");
      onClose();
    },
    onError: (error) => {
      addToast(getApiErrorMessages(error, "Não foi possível vincular esta conta ao cartão.")[0], "error");
    },
  });

  const canSave = !!carteiraId && Number(parcelasRestantes) >= 1 && Number(parcelasJaPagas) >= 0;

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
            disabled={mutation.isPending || !canSave}
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
          Isso converte <span className="font-semibold text-white">"{pending?.title}"</span> num parcelamento do
          cartão escolhido e remove a conta pendente avulsa. Nada é adivinhado automaticamente — confirme quantas
          parcelas já foram pagas.
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

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-text-secondary">Parcelas já pagas</span>
            <input
              type="number"
              min={0}
              value={parcelasJaPagas}
              onChange={(e) => setParcelasJaPagas(e.target.value)}
              className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-text-secondary">Parcelas restantes</span>
            <input
              type="number"
              min={1}
              value={parcelasRestantes}
              onChange={(e) => setParcelasRestantes(e.target.value)}
              className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
            />
          </label>
        </div>
      </div>
    </ModalShell>
  );
}
