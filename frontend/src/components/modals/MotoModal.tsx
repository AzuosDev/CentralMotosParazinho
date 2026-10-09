import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bike, Loader2 } from "lucide-react";

import { api } from "../../lib/api";
import { getApiErrorMessages } from "../../lib/errors";
import { formatCurrency, localDateString, utcDateStr } from "../../lib/finance";
import { CurrencyInput } from "../ui/CurrencyInput";
import { useToast } from "../ui/Toast";
import { ModalShell } from "./ModalShell";
import { WalletField, useWallets } from "./TransactionFormFields";
import type { Moto } from "../../types/api";

const inputCls =
  "w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-brand";

type MotoFormState = {
  modelo: string;
  ano: string;
  placa: string;
  chassi: string;
  cor: string;
  km: string;
  valorCompra: number;
  dataCompra: string;
  margemDesejada: string;
  precoAnunciado: number;
};

const emptyForm: MotoFormState = {
  modelo: "",
  ano: String(new Date().getFullYear()),
  placa: "",
  chassi: "",
  cor: "",
  km: "",
  valorCompra: 0,
  dataCompra: localDateString(),
  margemDesejada: "20",
  precoAnunciado: 0,
};

function fromMoto(moto: Moto): MotoFormState {
  return {
    modelo: moto.modelo,
    ano: String(moto.ano),
    placa: moto.placa,
    chassi: moto.chassi,
    cor: moto.cor,
    km: String(moto.km),
    valorCompra: moto.valorCompra,
    dataCompra: utcDateStr(moto.dataCompra),
    margemDesejada: String(moto.margemDesejada),
    precoAnunciado: moto.precoAnunciado ?? 0,
  };
}

/**
 * Cadastro e edição de moto. Status e dados da venda não aparecem aqui de propósito: a
 * venda entra por PATCH /api/motos/:id/vender (ver VenderMotoModal), o único lugar onde
 * valor e data de venda são gravados juntos.
 *
 * No cadastro é possível lançar a compra como despesa na carteira que pagou. É opcional
 * porque nem toda moto sai do caixa da loja (consignação, troca, pagamento por fora), e o
 * custo da moto não depende disso — ele vem de valorCompra.
 */
export function MotoModal({
  open,
  onClose,
  moto,
}: {
  open: boolean;
  onClose: () => void;
  moto?: Moto | null;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const walletsQuery = useWallets();
  const [form, setForm] = useState<MotoFormState>(emptyForm);
  // Só no cadastro: numa moto já cadastrada o lançamento da compra (se existe) é
  // sincronizado pelo backend quando valor ou data mudam, e criar um depois exigiria
  // decidir o que fazer com o histórico já lançado.
  const [lancarCompra, setLancarCompra] = useState(false);
  const [carteiraCompraId, setCarteiraCompraId] = useState("");
  const isEditing = Boolean(moto);

  useEffect(() => {
    if (!open) return;
    setForm(moto ? fromMoto(moto) : emptyForm);
    setLancarCompra(false);
    setCarteiraCompraId("");
  }, [open, moto]);

  function set<K extends keyof MotoFormState>(key: K, value: MotoFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const ano = Number(form.ano);
  const km = Number(form.km);
  const margem = Number(form.margemDesejada.replace(",", "."));

  // Lançar a compra só faz sentido com valor: o backend recusa despesa de R$ 0,00 e a
  // caixa de marcação ficaria prometendo um lançamento que não acontece.
  const lancarCompraAtivo = !isEditing && lancarCompra && form.valorCompra > 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        modelo: form.modelo.trim(),
        ano,
        // O backend normaliza placa e chassi (maiúsculas, sem separador) — mandar como
        // digitado é seguro e deixa a checagem de duplicata a cargo dele.
        placa: form.placa.trim(),
        chassi: form.chassi.trim(),
        cor: form.cor.trim(),
        km,
        valorCompra: form.valorCompra,
        dataCompra: form.dataCompra,
        margemDesejada: margem,
        // R$ 0,00 significa "ainda não anunciei": o campo não vai no corpo e a ficha cai no
        // preço sugerido. A API não tem como limpar um preço já gravado (precoAnunciado só
        // aceita número), então um valor existente só pode ser trocado por outro.
        precoAnunciado: form.precoAnunciado > 0 ? form.precoAnunciado : undefined,
      };

      if (moto) {
        await api.patch(`/api/motos/${moto._id}`, payload);
      } else {
        await api.post("/api/motos", {
          ...payload,
          ...(lancarCompraAtivo ? { lancarCompra: true, carteiraCompraId } : {}),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["motos"] });
      // A compra lançada (ou corrigida) mexe no saldo da carteira e no extrato.
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast(isEditing ? "Moto atualizada." : "Moto cadastrada no estoque.", "success");
      onClose();
    },
  });

  const canSave =
    (!lancarCompraAtivo || carteiraCompraId.length > 0) &&
    form.modelo.trim().length > 0 &&
    Number.isInteger(ano) &&
    ano >= 1900 &&
    ano <= 2200 &&
    form.placa.trim().length > 0 &&
    form.chassi.trim().length > 0 &&
    form.cor.trim().length > 0 &&
    form.km.trim().length > 0 &&
    Number.isFinite(km) &&
    km >= 0 &&
    form.valorCompra >= 0 &&
    form.dataCompra.length > 0 &&
    Number.isFinite(margem) &&
    margem >= 0;

  // Mesma conta do backend (MotosService#comCamposCalculados), com os gastos já
  // vinculados: mostra para onde a margem digitada leva o preço antes de salvar.
  const custoGastos = moto?.custoGastos ?? 0;
  const custoTotalPrevisto = form.valorCompra + custoGastos;
  const precoSugeridoPrevisto =
    Number.isFinite(margem) && margem >= 0 ? custoTotalPrevisto * (1 + margem / 100) : null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={isEditing ? "Editar Moto" : "Nova Moto"}
      icon={<Bike className="h-6 w-6 text-accent-brand" />}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saveMutation.isPending}
            className="flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-text-primary transition hover:bg-bg-overlay disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="moto-modal-form"
            disabled={saveMutation.isPending || !canSave}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? "Salvar Alterações" : "Cadastrar Moto"}
          </button>
        </div>
      }
    >
      <form
        id="moto-modal-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) saveMutation.mutate();
        }}
      >
        <label className="block">
          <span className="mb-2 block text-sm text-text-secondary">Modelo *</span>
          <input
            value={form.modelo}
            onChange={(e) => set("modelo", e.target.value)}
            placeholder="Ex: Honda CG 160 Titan"
            maxLength={120}
            className={inputCls}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm text-text-secondary">Ano *</span>
            <input
              type="number"
              min={1900}
              max={2200}
              value={form.ano}
              onChange={(e) => set("ano", e.target.value)}
              placeholder="Ex: 2021"
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-text-secondary">Cor *</span>
            <input
              value={form.cor}
              onChange={(e) => set("cor", e.target.value)}
              placeholder="Ex: Vermelha"
              maxLength={40}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-text-secondary">Placa *</span>
            <input
              value={form.placa}
              onChange={(e) => set("placa", e.target.value.toUpperCase())}
              placeholder="ABC1D23"
              maxLength={10}
              className={`${inputCls} uppercase`}
            />
            <span className="mt-1 block text-xs text-text-muted">
              Cada placa só pode estar cadastrada uma vez.
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-text-secondary">Chassi *</span>
            <input
              value={form.chassi}
              onChange={(e) => set("chassi", e.target.value.toUpperCase())}
              placeholder="9C2KC1670MR000000"
              maxLength={30}
              className={`${inputCls} uppercase`}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-text-secondary">Quilometragem *</span>
            <input
              type="number"
              min={0}
              step="1"
              value={form.km}
              onChange={(e) => set("km", e.target.value)}
              placeholder="Ex: 24500"
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-text-secondary">Data da compra *</span>
            <input
              type="date"
              value={form.dataCompra}
              onChange={(e) => set("dataCompra", e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-text-secondary">Valor da compra *</span>
            <CurrencyInput
              value={form.valorCompra}
              onChange={(v) => set("valorCompra", v)}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-text-secondary">Margem desejada (%) *</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={form.margemDesejada}
              onChange={(e) => set("margemDesejada", e.target.value)}
              placeholder="Ex: 20"
              className={inputCls}
            />
            <span className="mt-1 block text-xs text-text-muted">
              Percentual sobre o custo total (compra + gastos).
            </span>
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm text-text-secondary">Preço anunciado</span>
          <CurrencyInput
            value={form.precoAnunciado}
            onChange={(v) => set("precoAnunciado", v)}
            className={inputCls}
          />
          <span className="mt-1 block text-xs text-text-muted">
            Deixe em R$ 0,00 enquanto não anunciar — a ficha usa o preço sugerido como
            referência do desconto máximo.
          </span>
        </label>

        {!isEditing && (
          <div className="rounded-xl bg-bg-muted p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={lancarCompra}
                onChange={(e) => setLancarCompra(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-bg-muted bg-bg-overlay accent-accent-brand"
              />
              <span>
                <span className="block text-sm font-semibold text-text-primary">
                  Lançar compra na carteira
                </span>
                <span className="block text-xs text-text-secondary">
                  Cria a despesa da compra na carteira que pagou, com a data da compra. O custo
                  da moto não muda — ele já conta o valor da compra.
                </span>
              </span>
            </label>

            {lancarCompra && (
              <div className="mt-4">
                <WalletField
                  wallets={walletsQuery.data ?? []}
                  value={carteiraCompraId}
                  onChange={setCarteiraCompraId}
                  loading={walletsQuery.isLoading}
                />
                {form.valorCompra <= 0 && (
                  <p className="mt-2 text-xs text-status-warning">
                    Informe o valor da compra para lançá-la na carteira.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {precoSugeridoPrevisto !== null && (
          <div className="rounded-xl bg-bg-muted p-3 text-xs text-text-secondary">
            Custo total{" "}
            <span className="font-semibold text-text-primary">
              {formatCurrency(custoTotalPrevisto)}
            </span>
            {custoGastos > 0 && <> (compra + {formatCurrency(custoGastos)} de gastos lançados)</>}{" "}
            · preço sugerido{" "}
            <span className="font-semibold text-text-primary">
              {formatCurrency(precoSugeridoPrevisto)}
            </span>
          </div>
        )}

        {saveMutation.isError && (
          <div className="rounded-xl bg-accent-red/10 p-3 text-sm text-accent-red">
            {getApiErrorMessages(saveMutation.error, "Não foi possível salvar a moto.").map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
      </form>
    </ModalShell>
  );
}
