import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Loader2 } from "lucide-react";

import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { getApiErrorMessages } from "../../lib/errors";
import { formatCurrency, formatDisplayDate, localDateString, utcDateStr } from "../../lib/finance";
import { CurrencyInput } from "../ui/CurrencyInput";
import { useToast } from "../ui/Toast";
import { ModalShell } from "./ModalShell";
import type { Moto } from "../../types/api";

const inputCls =
  "w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-brand";

/**
 * Registra a venda: valor e data vão juntos, porque é o único caminho que marca o status
 * como "vendida" (PATCH /api/motos/:id/vender). O lucro mostrado aqui é a mesma conta do
 * backend — valor de venda menos custo total (compra + gastos vinculados).
 */
export function VenderMotoModal({
  open,
  onClose,
  moto,
}: {
  open: boolean;
  onClose: () => void;
  moto: Moto;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [valorVenda, setValorVenda] = useState(0);
  const [dataVenda, setDataVenda] = useState(localDateString());

  useEffect(() => {
    if (!open) return;
    // Nasce no preço anunciado (ou no sugerido): é o valor que a loja pediu, e a venda
    // costuma sair nele ou num desconto a partir dele.
    setValorVenda(moto.precoAnunciado ?? moto.precoSugerido);
    setDataVenda(localDateString());
  }, [open, moto.precoAnunciado, moto.precoSugerido]);

  const dataCompra = utcDateStr(moto.dataCompra);
  const dataInvalida = dataVenda.length > 0 && dataVenda < dataCompra;
  const lucro = Number((valorVenda - moto.custoTotal).toFixed(2));
  const prejuizo = lucro < 0;

  const venderMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/motos/${moto._id}/vender`, { valorVenda, dataVenda });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["motos"] });
      addToast("Venda registrada.", "success");
      onClose();
    },
  });

  const canSave = valorVenda > 0 && dataVenda.length > 0 && !dataInvalida;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Registrar Venda"
      icon={<HandCoins className="h-6 w-6 text-accent-brand" />}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={venderMutation.isPending}
            className="flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-text-primary transition hover:bg-bg-overlay disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="vender-moto-form"
            disabled={venderMutation.isPending || !canSave}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {venderMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar Venda
          </button>
        </div>
      }
    >
      <form
        id="vender-moto-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) venderMutation.mutate();
        }}
      >
        <div className="rounded-xl bg-bg-muted p-3 text-sm">
          <p className="font-semibold text-text-primary">
            {moto.modelo} · {moto.placa}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Custo total {formatCurrency(moto.custoTotal)} · comprada em{" "}
            {formatDisplayDate(moto.dataCompra)}
          </p>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm text-text-secondary">Valor da venda *</span>
          <CurrencyInput
            value={valorVenda}
            onChange={setValorVenda}
            className="w-full rounded-2xl border border-bg-muted bg-bg-muted px-4 py-3 text-center font-sans text-3xl font-bold text-accent-brand outline-none transition focus:border-accent-brand"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-text-secondary">Data da venda *</span>
          <input
            type="date"
            value={dataVenda}
            min={dataCompra}
            onChange={(e) => setDataVenda(e.target.value)}
            className={inputCls}
          />
          {dataInvalida && (
            <span className="mt-1 block text-xs text-accent-red">
              A venda não pode ser anterior à compra ({formatDisplayDate(moto.dataCompra)}).
            </span>
          )}
        </label>

        {valorVenda > 0 && (
          <div
            className={cn(
              "rounded-xl p-4",
              prejuizo ? "bg-accent-red/10" : "bg-accent-brand/10",
            )}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              {prejuizo ? "Prejuízo nesta venda" : "Lucro nesta venda"}
            </p>
            <p
              className={cn(
                "mt-1 font-sans text-2xl font-extrabold",
                prejuizo ? "text-accent-red" : "text-accent-brand",
              )}
            >
              {formatCurrency(Math.abs(lucro))}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {formatCurrency(valorVenda)} de venda − {formatCurrency(moto.custoTotal)} de custo
              total.
            </p>
          </div>
        )}

        <p className="text-xs text-text-muted">
          Marcar como vendida não cria um lançamento de entrada: registre o recebimento como
          ganho na carteira que recebeu o dinheiro, se quiser que ele apareça no saldo.
        </p>

        {venderMutation.isError && (
          <div className="rounded-xl bg-accent-red/10 p-3 text-sm text-accent-red">
            {getApiErrorMessages(venderMutation.error, "Não foi possível registrar a venda.").map(
              (m) => (
                <p key={m}>{m}</p>
              ),
            )}
          </div>
        )}
      </form>
    </ModalShell>
  );
}
