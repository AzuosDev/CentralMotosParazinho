import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";

import { api } from "../../lib/api";
import { getApiErrorMessages } from "../../lib/errors";
import { formatCurrency } from "../../lib/finance";
import { useToast } from "../ui/Toast";
import { CurrencyInput } from "../ui/CurrencyInput";
import { ModalShell } from "./ModalShell";
import { CategoryField, useCategories } from "./TransactionFormFields";
import type { AvisoLimite } from "../../types/api";

type LimitBlock = { message: string; limite: number; limiteUsado: number; limiteDisponivel: number };

export function NovoParcelamentoModal({
  open,
  onClose,
  cartaoId,
}: {
  open: boolean;
  onClose: () => void;
  cartaoId: string;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const categoriesQuery = useCategories();

  const [descricao, setDescricao] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [valorTotal, setValorTotal] = useState(0);
  const [totalParcelas, setTotalParcelas] = useState("2");
  const [dataCompra, setDataCompra] = useState("");
  const [limitBlock, setLimitBlock] = useState<LimitBlock | null>(null);

  useEffect(() => {
    if (open) {
      setDescricao("");
      setCategoryId("");
      setValorTotal(0);
      setTotalParcelas("2");
      setDataCompra("");
      setLimitBlock(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (confirmarMesmoAssim?: boolean) => {
      const { data } = await api.post("/api/cartoes/parcelamentos", {
        carteiraId: cartaoId,
        categoryId: categoryId || undefined,
        descricao: descricao.trim(),
        valorTotal,
        totalParcelas: Number(totalParcelas),
        dataCompra,
        confirmarMesmoAssim: confirmarMesmoAssim || undefined,
      });
      return (data as { avisoLimite?: AvisoLimite }).avisoLimite ?? null;
    },
    onSuccess: (avisoLimite) => {
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      setLimitBlock(null);
      addToast("Compra parcelada criada com sucesso.", "success");
      if (avisoLimite?.avisoProximoLimite) {
        addToast(
          `Atenção: você já usou ${avisoLimite.percentualUsado}% do limite deste cartão (${formatCurrency(avisoLimite.limiteDisponivel)} disponível).`,
          "warning",
        );
      }
      onClose();
    },
    onError: (error) => {
      if (
        isAxiosError<{ message?: string; limite?: number; limiteUsado?: number; limiteDisponivel?: number }>(error) &&
        error.response?.status === 409 &&
        typeof error.response.data?.limiteDisponivel === "number"
      ) {
        setLimitBlock({
          message: error.response.data.message ?? "Esta compra ultrapassa o limite disponível do cartão.",
          limite: error.response.data.limite ?? 0,
          limiteUsado: error.response.data.limiteUsado ?? 0,
          limiteDisponivel: error.response.data.limiteDisponivel,
        });
        return;
      }
      setLimitBlock(null);
    },
  });

  const canSubmit =
    descricao.trim().length > 0 && valorTotal > 0 && Number(totalParcelas) >= 2 && !!dataCompra;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Nova Compra Parcelada"
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
            onClick={() => mutation.mutate(undefined)}
            disabled={mutation.isPending || !canSubmit}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-lime px-5 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-70"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm text-text-secondary">Descrição <span className="text-accent-red">*</span></span>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Notebook, Geladeira…"
            maxLength={200}
            className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none transition focus:border-accent-lime"
          />
        </label>

        <CategoryField
          categories={categoriesQuery.data ?? []}
          value={categoryId}
          onChange={setCategoryId}
          loading={categoriesQuery.isLoading}
        />

        <label className="block">
          <span className="mb-2 block text-sm text-text-secondary">Valor total <span className="text-accent-red">*</span></span>
          <div className="flex items-center rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 focus-within:border-accent-lime">
            <CurrencyInput
              value={valorTotal}
              onChange={setValorTotal}
              className="w-full bg-transparent text-white outline-none"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-text-secondary">Parcelas <span className="text-accent-red">*</span></span>
          <input
            type="number"
            min={2}
            max={48}
            value={totalParcelas}
            onChange={(e) => setTotalParcelas(e.target.value)}
            className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none transition focus:border-accent-lime"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-text-secondary">Data da compra <span className="text-accent-red">*</span></span>
          <input
            type="date"
            value={dataCompra}
            onChange={(e) => setDataCompra(e.target.value)}
            className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none transition focus:border-accent-lime"
          />
          <span className="mt-1 block text-xs text-text-secondary">
            A data real da compra — é a partir dela que o app calcula em qual fatura cada parcela cai.
          </span>
        </label>

        {limitBlock && (
          <div className="space-y-3 rounded-xl border border-accent-red/40 bg-accent-red/10 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-accent-red" />
              <div className="text-sm text-red-200">
                <p className="font-semibold">{limitBlock.message}</p>
                <p className="mt-1 text-red-200/80">
                  Limite disponível: {formatCurrency(limitBlock.limiteDisponivel)} de {formatCurrency(limitBlock.limite)}.
                  Esta é uma compra que de fato aconteceu — você pode confirmar mesmo assim.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => mutation.mutate(true)}
              disabled={mutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-red px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-70"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar mesmo assim
            </button>
          </div>
        )}

        {mutation.isError && !limitBlock && (
          <div className="rounded-xl bg-accent-red/10 p-3 text-sm text-accent-red">
            {getApiErrorMessages(mutation.error, "Não foi possível criar esta compra parcelada.").map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
