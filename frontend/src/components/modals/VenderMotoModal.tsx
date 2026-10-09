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
import { WalletField, useIncomeCategories, useWallets } from "./TransactionFormFields";
import type { Moto, MotoResumo } from "../../types/api";

const inputCls =
  "w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-brand";

/** Categoria de sistema criada pelo backend para a receita da venda. */
const SLUG_VENDA = "venda-de-moto";

export type ModoVenda = "registrar" | "editar";

/**
 * Registra, corrige ou lança na carteira a venda de uma moto.
 *
 * A venda é uma receita de verdade: sem a carteira que recebeu o dinheiro, a moto sairia
 * do estoque e saldo, dashboard e extrato não mudariam nada. Por isso a carteira é
 * obrigatória nos três caminhos:
 *
 * - "registrar": PATCH /api/motos/:id/vender — marca como vendida e cria a receita;
 * - "editar" com lançamento existente: PATCH /api/motos/:id/venda — corrige valor, data
 *   ou carteira e a receita acompanha;
 * - "editar" sem lançamento: mesma rota, para a moto que foi marcada como vendida antes
 *   desta tela gerar receita ("Lançar venda na carteira").
 */
export function VenderMotoModal({
  open,
  onClose,
  moto,
  modo = "registrar",
  lancamentoVenda = null,
}: {
  open: boolean;
  onClose: () => void;
  moto: Moto;
  modo?: ModoVenda;
  lancamentoVenda?: MotoResumo["lancamentoVenda"];
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const walletsQuery = useWallets();
  const categoriesQuery = useIncomeCategories();
  const [valorVenda, setValorVenda] = useState(0);
  const [dataVenda, setDataVenda] = useState(localDateString());
  const [carteiraId, setCarteiraId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const categorias = categoriesQuery.data ?? [];
  const categoriaVenda = categorias.find((c) => c.slug === SLUG_VENDA);
  // Sem lançamento numa moto já vendida: a venda é antiga (foi registrada antes de a tela
  // gerar receita) e o que falta é só jogá-la na carteira.
  const lancarPendente = modo === "editar" && !lancamentoVenda;

  useEffect(() => {
    if (!open) return;

    if (modo === "editar") {
      // Edição parte do que está gravado na moto, não do preço anunciado.
      setValorVenda(moto.valorVenda ?? moto.precoAnunciado ?? moto.precoSugerido);
      setDataVenda(moto.dataVenda ? utcDateStr(moto.dataVenda) : localDateString());
      setCarteiraId(lancamentoVenda?.carteiraId ?? "");
      setCategoryId(lancamentoVenda?.categoryId ?? "");
      return;
    }

    // Nasce no preço anunciado (ou no sugerido): é o valor que a loja pediu, e a venda
    // costuma sair nele ou num desconto a partir dele.
    setValorVenda(moto.precoAnunciado ?? moto.precoSugerido);
    setDataVenda(localDateString());
    setCarteiraId("");
    setCategoryId("");
  }, [open, modo, moto.precoAnunciado, moto.precoSugerido, moto.valorVenda, moto.dataVenda, lancamentoVenda]);

  // Default da categoria só depois que a lista chega — e sem sobrescrever a que já estava
  // gravada no lançamento.
  useEffect(() => {
    if (!open || categoryId || !categoriaVenda) return;
    if (modo === "editar" && lancamentoVenda?.categoryId) return;
    setCategoryId(categoriaVenda.id);
  }, [open, categoryId, categoriaVenda, modo, lancamentoVenda]);

  const dataCompra = utcDateStr(moto.dataCompra);
  const dataInvalida = dataVenda.length > 0 && dataVenda < dataCompra;
  const lucro = Number((valorVenda - moto.custoTotal).toFixed(2));
  const prejuizo = lucro < 0;

  const venderMutation = useMutation({
    mutationFn: async () => {
      const corpo = { valorVenda, dataVenda, carteiraId, categoryId: categoryId || undefined };

      if (modo === "editar") {
        await api.patch(`/api/motos/${moto._id}/venda`, corpo);
        return;
      }
      await api.patch(`/api/motos/${moto._id}/vender`, corpo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["motos"] });
      // A venda virou receita: saldo da carteira, dashboard e extrato mudaram junto.
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast(
        modo === "registrar"
          ? "Venda registrada e lançada na carteira."
          : lancarPendente
            ? "Venda lançada na carteira."
            : "Venda atualizada.",
        "success",
      );
      onClose();
    },
  });

  const canSave =
    valorVenda > 0 && dataVenda.length > 0 && !dataInvalida && carteiraId.length > 0;

  const titulo = modo === "registrar" ? "Registrar Venda" : lancarPendente ? "Lançar Venda na Carteira" : "Editar Venda";
  const rotuloConfirmar = modo === "registrar" ? "Confirmar Venda" : lancarPendente ? "Lançar na Carteira" : "Salvar Alterações";

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={titulo}
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
            {rotuloConfirmar}
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

        {lancarPendente && (
          <p className="rounded-xl bg-status-info/10 p-3 text-xs text-status-info">
            Esta venda foi registrada antes de a ficha lançar o dinheiro na carteira. Escolha a
            carteira que recebeu e a receita entra no saldo com a data da venda.
          </p>
        )}

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

        {/* Obrigatória: é a conta que recebeu o dinheiro. Cartão de crédito não aparece
            aqui (useWallets não traz cartões) e o backend recusa, porque cartão é dívida. */}
        <WalletField
          wallets={walletsQuery.data ?? []}
          value={carteiraId}
          onChange={setCarteiraId}
          loading={walletsQuery.isLoading}
        />

        <label className="block">
          <span className="mb-2 block text-sm text-text-secondary">Categoria da receita</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputCls}
          >
            <option value="">Venda de Moto (padrão)</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.name}
              </option>
            ))}
          </select>
        </label>

        {valorVenda > 0 && (
          <div className={cn("rounded-xl p-4", prejuizo ? "bg-accent-red/10" : "bg-accent-brand/10")}>
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
          A venda entra como receita na carteira escolhida, com a data da venda. O lançamento
          fica amarrado à moto: para corrigir ou cancelar, use esta ficha — a tela de
          transações não edita nem exclui esse lançamento.
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
