import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Controller } from "react-hook-form";
import type { Control, FieldErrors, FieldValues, Path, UseFormRegister, UseFormWatch } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CurrencyInput } from "../ui/CurrencyInput";
import { CreditCard, X } from "lucide-react";

import { DynamicIcon } from "../DynamicIcon";
import { api } from "../../lib/api";
import { asArray, normalizeCategory } from "../../lib/finance";
import { cn } from "../../lib/utils";
import type { Category as ApiCategory, PreviewFatura, Wallet } from "../../types/api";
import type { Category } from "../../types/finance";

export type TransactionFormValues = {
  amount: number;
  categoryId?: string;
  date: string;
  description?: string;
};

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await api.get<ApiCategory[]>("/api/categories");
      const source =
        typeof data === "object" && data !== null && "categories" in data
          ? (data as { categories?: unknown }).categories
          : data;

      return asArray(source).map((item, index) => normalizeCategory(item, index));
    },
  });
}

export function useIncomeCategories() {
  return useQuery<Category[]>({
    queryKey: ["categories", "income"],
    queryFn: async () => {
      const { data } = await api.get<ApiCategory[]>("/api/categories", { params: { income: "true" } });
      const source =
        typeof data === "object" && data !== null && "categories" in data
          ? (data as { categories?: unknown }).categories
          : data;

      return asArray(source).map((item, index) => normalizeCategory(item, index));
    },
  });
}

export function AmountField<TFieldValues extends FieldValues>({
  control,
  errors,
  disabled,
}: {
  control: Control<TFieldValues>;
  errors: FieldErrors<TFieldValues>;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-text-secondary">Valor</span>
      <div className="flex items-center rounded-2xl border border-bg-muted bg-bg-muted px-4 py-3 focus-within:border-accent-lime">
        <Controller
          control={control}
          name={"amount" as Path<TFieldValues>}
          render={({ field }) => (
            <CurrencyInput
              value={field.value ?? 0}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={disabled}
              className="w-full bg-transparent text-center font-sans text-3xl font-bold text-accent-lime outline-none disabled:opacity-60"
            />
          )}
        />
      </div>
      {errors.amount && (
        <p className="mt-2 text-xs text-accent-red">{String(errors.amount.message)}</p>
      )}
    </label>
  );
}

export function CategoryField({
  categories,
  value,
  onChange,
  error,
  loading,
}: {
  categories: Category[];
  value?: string;
  onChange: (categoryId: string) => void;
  error?: string;
  loading: boolean;
}) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      await api.delete(`/api/categories/${categoryId}`);
    },
    onSuccess: (_, categoryId) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      if (value === categoryId) {
        onChange("");
      }
    },
  });

  return (
    <div>
      <span className="mb-2 block text-sm text-text-secondary">Categoria</span>
      <div className="max-h-48 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {loading
            ? Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-xl bg-bg-muted" />
              ))
            : categories.map((category) => {
                const active = category.id === value;

                return (
                  <div key={category.id} className="group/cat relative">
                    <button
                      type="button"
                      onClick={() => onChange(category.id)}
                      className={cn(
                        "flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border bg-bg-muted p-3 text-center text-xs font-semibold transition",
                        active
                          ? "border-accent-lime text-text-primary"
                          : "border-transparent text-text-secondary hover:border-bg-overlay hover:text-text-primary",
                      )}
                    >
                      <span
                        className="grid h-9 w-9 place-items-center rounded-xl"
                        style={{ backgroundColor: `${category.color}22` }}
                      >
                        <DynamicIcon
                          name={category.icon}
                          className="h-5 w-5"
                          style={{ color: category.color }}
                        />
                      </span>
                      <span className="line-clamp-2">{category.name}</span>
                    </button>

                    {!category.isDefault && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(category.id); }}
                        disabled={deleteMutation.isPending}
                        className="absolute right-1 top-1 flex rounded-md p-0.5 text-text-muted transition hover:bg-accent-red/10 hover:text-accent-red disabled:opacity-40"
                        aria-label={`Excluir categoria ${category.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-accent-red">{error}</p>}
    </div>
  );
}

export function useWallets() {
  return useQuery<Array<{ _id: string; nome: string }>>({
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data } = await api.get("/api/wallets");
      return Array.isArray(data) ? data : [];
    },
  });
}

// Inclui cartões de crédito junto das carteiras — usado no seletor de forma de pagamento
// de despesas (POST /api/transactions aceita carteiraId de cartão). useWallets() acima
// continua sem cartões: ganhos, transferências e a carteira pagadora de contas não usam.
export function useWalletsWithCartoes() {
  return useQuery<Wallet[]>({
    queryKey: ["wallets", "incluir-cartoes"],
    queryFn: async () => {
      const { data } = await api.get<Wallet[]>("/api/wallets", { params: { incluirCartoes: "true" } });
      return Array.isArray(data) ? data : [];
    },
  });
}

// Preview read-only de em qual fatura uma compra cairia numa data — não cria nada no
// backend (CartoesService#previsualizarFatura). Usado para mostrar a regra de fechamento
// antes do usuário confirmar a compra.
export function useFaturaPreview(cartaoId: string | undefined, data: string | undefined) {
  return useQuery<PreviewFatura>({
    queryKey: ["cartoes", cartaoId, "preview-fatura", data],
    queryFn: async () => {
      const { data: res } = await api.get<PreviewFatura>(`/api/cartoes/${cartaoId}/preview-fatura`, {
        params: { data },
      });
      return res;
    },
    enabled: Boolean(cartaoId && data),
    staleTime: 60_000,
  });
}

export function PaymentMethodField({
  wallets,
  value,
  onChange,
  error,
  loading,
  disabled,
}: {
  wallets: Wallet[];
  value?: string;
  onChange: (id: string) => void;
  error?: string;
  loading: boolean;
  disabled?: boolean;
}) {
  if (loading) return <div className="h-12 animate-pulse rounded-xl bg-bg-muted" />;

  const contas = wallets.filter((w) => w.tipo !== "credito");
  const cartoes = wallets.filter((w) => w.tipo === "credito");

  if (wallets.length === 0) {
    return (
      <div className="rounded-xl bg-yellow-500/10 p-3 text-sm text-status-warning">
        ⚠️ Nenhuma carteira encontrada.{" "}
        <Link to="/carteiras" className="font-bold underline underline-offset-2 hover:text-status-warning-soft">
          Criar carteira agora →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <span className="mb-2 block text-sm text-text-secondary">Forma de pagamento</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-lime disabled:opacity-60"
      >
        <option value="">Selecione…</option>
        <optgroup label="Carteiras">
          {contas.map((w) => (
            <option key={w._id} value={w._id}>{w.nome}</option>
          ))}
        </optgroup>
        {cartoes.length > 0 && (
          <optgroup label="Cartões de crédito">
            {cartoes.map((w) => (
              <option key={w._id} value={w._id}>{w.nome}</option>
            ))}
          </optgroup>
        )}
      </select>
      {error && <p className="mt-2 text-xs text-accent-red">{error}</p>}
    </div>
  );
}

export function FaturaPreviewHint({ cartaoId, data }: { cartaoId?: string; data?: string }) {
  const previewQuery = useFaturaPreview(cartaoId, data);
  if (!cartaoId || !data) return null;
  if (previewQuery.isLoading) return <div className="h-8 animate-pulse rounded-lg bg-bg-muted" />;
  if (!previewQuery.data) return null;

  const [ano, mes] = previewQuery.data.mesReferencia.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(ano, mes - 1, 1)),
  );

  return (
    <div className="flex items-center gap-2 rounded-xl bg-bg-muted px-3 py-2 text-xs text-text-secondary">
      <CreditCard className="h-3.5 w-3.5 shrink-0 text-accent-lime" />
      Essa compra vai cair na fatura de <span className="font-semibold text-text-primary">{label}</span>.
    </div>
  );
}

export function WalletField({
  wallets,
  value,
  onChange,
  error,
  loading,
}: {
  wallets: Array<{ _id: string; nome: string }>;
  value?: string;
  onChange: (id: string) => void;
  error?: string;
  loading: boolean;
}) {
  if (loading) return <div className="h-12 animate-pulse rounded-xl bg-bg-muted" />;

  if (wallets.length === 0) {
    return (
      <div className="rounded-xl bg-yellow-500/10 p-3 text-sm text-status-warning">
        ⚠️ Nenhuma carteira encontrada.{" "}
        <Link to="/carteiras" className="font-bold underline underline-offset-2 hover:text-status-warning-soft">
          Criar carteira agora →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <span className="mb-2 block text-sm text-text-secondary">Carteira</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-lime"
      >
        <option value="">Selecione uma carteira…</option>
        {wallets.map((w) => (
          <option key={w._id} value={w._id}>{w.nome}</option>
        ))}
      </select>
      {error && <p className="mt-2 text-xs text-accent-red">{error}</p>}
    </div>
  );
}

export function DateAndDescriptionFields({
  register,
  watch,
  errors,
  descriptionPlaceholder = "Observação opcional",
  disabledDate,
}: {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  errors: any;
  descriptionPlaceholder?: string;
  disabledDate?: boolean;
}) {
  const description = watch("description") ?? "";
  const count = useMemo(() => description.length, [description]);

  return (
    <div className="grid gap-4">
      <label className="block">
        <span className="mb-2 block text-sm text-text-secondary">Data</span>
        <input
          type="date"
          disabled={disabledDate}
          className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-lime disabled:opacity-60"
          {...register("date")}
        />
        {errors.date && (
          <p className="mt-2 text-xs text-accent-red">{errors.date.message}</p>
        )}
      </label>

      <label className="block">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm text-text-secondary">Descrição</span>
          <span className="text-xs text-text-muted">{count}/500</span>
        </div>
        <textarea
          rows={4}
          maxLength={500}
          className="w-full resize-none rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-lime"
          placeholder={descriptionPlaceholder}
          {...register("description")}
        />
        {errors.description && (
          <p className="mt-2 text-xs text-accent-red">{errors.description.message}</p>
        )}
      </label>
    </div>
  );
}
