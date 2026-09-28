import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2 } from "lucide-react";

import { api } from "../../lib/api";
import { getApiErrorMessages } from "../../lib/errors";
import { formatCurrency } from "../../lib/finance";
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
  cartaoId,
  cartaoNome,
}: {
  open: boolean;
  onClose: () => void;
  // Modo 1 (ContasPage): a conta já é conhecida, usuário escolhe o cartão.
  pending?: PendingLike | null;
  // Modo 2 (CartaoPage): o cartão já é conhecido (esta página), usuário escolhe a conta
  // avulsa/parcelada a vincular. Mutuamente exclusivo com `pending`.
  cartaoId?: string;
  cartaoNome?: string;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [carteiraId, setCarteiraId] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [parcelasJaPagas, setParcelasJaPagas] = useState("0");
  const [parcelasRestantes, setParcelasRestantes] = useState("1");
  const pickingPending = !!cartaoId;

  useEffect(() => {
    if (open && pending) {
      setCarteiraId("");
      setPendingId("");
      const jaPagas = pending.parcelas?.parcelasPagas?.length ?? 0;
      const total = pending.parcelas?.totalParcelas ?? jaPagas + 1;
      setParcelasJaPagas(String(jaPagas));
      setParcelasRestantes(String(Math.max(1, total - jaPagas)));
    } else if (open) {
      setCarteiraId("");
      setPendingId("");
      setParcelasJaPagas("0");
      setParcelasRestantes("1");
    }
  }, [open, pending, cartaoId]);

  const cartoesQuery = useQuery<Cartao[]>({
    queryKey: ["cartoes"],
    queryFn: async () => {
      const { data } = await api.get<Cartao[]>("/api/cartoes");
      return Array.isArray(data) ? data : [];
    },
    enabled: open && !pickingPending,
  });

  // Sem month/year, GET /api/accounts devolve os moldes/contas crus — filtra aqui pra só
  // contas avulsas/parceladas ainda não vinculadas a nenhum cartão (mesmo critério do botão
  // equivalente em ContasPage.tsx: !isRecorrente && !paid).
  type ContaPendenteOption = { id: string; title: string; value: number; isParcelada?: boolean; parcelas?: { totalParcelas?: number; parcelasPagas?: number[] } };
  const pendingsQuery = useQuery<ContaPendenteOption[]>({
    queryKey: ["accounts", "vincular-cartao-opcoes"],
    queryFn: async () => {
      const { data } = await api.get("/api/accounts", { params: { tipo: "PAGAR", paid: "false" } });
      const list = Array.isArray(data) ? data : [];
      return list
        .filter((item: { isRecorrente?: boolean; faturaId?: string }) => !item.isRecorrente && !item.faturaId)
        .map((item: { _id: string; title: string; value: number; isParcelada?: boolean; parcelas?: ContaPendenteOption["parcelas"] }) => ({
          id: item._id,
          title: item.title,
          value: item.value,
          isParcelada: item.isParcelada,
          parcelas: item.parcelas,
        }));
    },
    enabled: open && pickingPending,
  });

  const selectedPendingOption = pendingsQuery.data?.find((p) => p.id === pendingId);

  useEffect(() => {
    if (!selectedPendingOption) return;
    const jaPagas = selectedPendingOption.parcelas?.parcelasPagas?.length ?? 0;
    const total = selectedPendingOption.parcelas?.totalParcelas ?? jaPagas + 1;
    setParcelasJaPagas(String(jaPagas));
    setParcelasRestantes(String(Math.max(1, total - jaPagas)));
  }, [selectedPendingOption]);

  const effectivePendingId = pending?.id ?? pendingId;
  const effectivePendingTitle = pending?.title ?? selectedPendingOption?.title;
  const effectiveCarteiraId = cartaoId ?? carteiraId;

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post("/api/cartoes/vincular-conta-pendente", {
        pendingAccountId: effectivePendingId,
        carteiraId: effectiveCarteiraId,
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

  const canSave = !!effectivePendingId && !!effectiveCarteiraId && Number(parcelasRestantes) >= 1 && Number(parcelasJaPagas) >= 0;

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
            className="flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-text-primary transition hover:bg-bg-overlay disabled:opacity-70"
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
          {effectivePendingTitle ? (
            <>Isso converte <span className="font-semibold text-text-primary">"{effectivePendingTitle}"</span> num parcelamento</>
          ) : (
            "Isso converte a conta escolhida num parcelamento"
          )}{" "}
          {pickingPending ? <>em <span className="font-semibold text-text-primary">{cartaoNome}</span></> : "do cartão escolhido"} e
          remove a conta pendente avulsa. Nada é adivinhado automaticamente — confirme quantas parcelas já foram pagas.
        </p>

        {pickingPending ? (
          <div>
            <span className="mb-2 block text-sm text-text-secondary">Conta pendente</span>
            {pendingsQuery.isLoading ? (
              <div className="h-12 animate-pulse rounded-xl bg-bg-muted" />
            ) : (pendingsQuery.data ?? []).length === 0 ? (
              <p className="rounded-xl bg-yellow-500/10 p-3 text-sm text-status-warning">
                Você não tem nenhuma conta avulsa ou parcelada disponível pra vincular.
              </p>
            ) : (
              <select
                value={pendingId}
                onChange={(e) => setPendingId(e.target.value)}
                className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-lime"
              >
                <option value="">Selecione…</option>
                {(pendingsQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.title} — {formatCurrency(p.value)}</option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div>
            <span className="mb-2 block text-sm text-text-secondary">Cartão</span>
            {cartoesQuery.isLoading ? (
              <div className="h-12 animate-pulse rounded-xl bg-bg-muted" />
            ) : (cartoesQuery.data ?? []).length === 0 ? (
              <p className="rounded-xl bg-yellow-500/10 p-3 text-sm text-status-warning">
                Você ainda não tem nenhum cartão cadastrado.
              </p>
            ) : (
              <select
                value={carteiraId}
                onChange={(e) => setCarteiraId(e.target.value)}
                className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-lime"
              >
                <option value="">Selecione…</option>
                {(cartoesQuery.data ?? []).map((c) => (
                  <option key={c._id} value={c._id}>{c.nome}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-text-secondary">Parcelas já pagas</span>
            <input
              type="number"
              min={0}
              value={parcelasJaPagas}
              onChange={(e) => setParcelasJaPagas(e.target.value)}
              className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none focus:border-accent-lime"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-text-secondary">Parcelas restantes</span>
            <input
              type="number"
              min={1}
              value={parcelasRestantes}
              onChange={(e) => setParcelasRestantes(e.target.value)}
              className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none focus:border-accent-lime"
            />
          </label>
        </div>
      </div>
    </ModalShell>
  );
}
