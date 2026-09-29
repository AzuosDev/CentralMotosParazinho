import { useCallback, useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { isAxiosError } from "axios";
import { AlertTriangle, ArrowLeftRight, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { z } from "zod";
import { Link } from "react-router-dom";

import { api } from "../../lib/api";
import { getApiErrorMessages, setFieldErrorsFromApi } from "../../lib/errors";
import { buildTransactionPayload, dateInputValue, formatCurrency, localDateString } from "../../lib/finance";
import { useToast } from "../ui/Toast";
import type { Transaction } from "../../types/finance";
import type { AvisoLimite } from "../../types/api";
import {
  AmountField,
  CategoryField,
  DateAndDescriptionFields,
  FaturaPreviewHint,
  PaymentMethodField,
  WalletField,
  useCategories,
  useIncomeCategories,
  useWallets,
  useWalletsWithCartoes,
} from "./TransactionFormFields";
import { ModalShell } from "./ModalShell";
import { cn } from "../../lib/utils";

type LimitBlock = { message: string; limite: number; limiteUsado: number; limiteDisponivel: number };

type Tab = "INCOME" | "EXPENSE" | "TRANSFER";

function todayInputValue() {
  return localDateString();
}

const defaultValues = {
  amount: 0,
  categoryId: "",
  carteiraId: "",
  carteiraOrigemId: "",
  carteiraDestinoId: "",
  date: todayInputValue(),
  description: "",
  parcelas: "1",
  confirmarMesmoAssim: false,
};

const incomeSchema = z.object({
  amount: z.number().positive("Informe um valor maior que zero."),
  categoryId: z.string().optional().default(""),
  carteiraId: z.string().min(1, "Selecione uma carteira."),
  date: z.string().min(1, "Informe a data."),
  description: z.string().max(500).optional(),
  carteiraOrigemId: z.string().optional().default(""),
  carteiraDestinoId: z.string().optional().default(""),
  parcelas: z.string().optional().default("1"),
  confirmarMesmoAssim: z.boolean().optional().default(false),
});

const expenseSchema = z.object({
  amount: z.number().positive("Informe um valor maior que zero."),
  categoryId: z.string().min(1, "Escolha uma categoria."),
  carteiraId: z.string().min(1, "Selecione uma forma de pagamento."),
  date: z.string().min(1, "Informe a data."),
  description: z.string().max(500).optional(),
  carteiraOrigemId: z.string().optional().default(""),
  carteiraDestinoId: z.string().optional().default(""),
  parcelas: z.string().optional().default("1"),
  confirmarMesmoAssim: z.boolean().optional().default(false),
});

const transferSchema = z
  .object({
    amount: z.number().positive("Informe um valor maior que zero."),
    categoryId: z.string().optional().default(""),
    carteiraId: z.string().optional().default(""),
    carteiraOrigemId: z.string().min(1, "Selecione a carteira de origem."),
    carteiraDestinoId: z.string().min(1, "Selecione a carteira de destino."),
    date: z.string().min(1, "Informe a data."),
    description: z.string().max(500).optional(),
    parcelas: z.string().optional().default("1"),
    confirmarMesmoAssim: z.boolean().optional().default(false),
  })
  .refine((d) => d.carteiraOrigemId !== d.carteiraDestinoId, {
    message: "As carteiras de origem e destino devem ser diferentes.",
    path: ["carteiraDestinoId"],
  });

const tabConfig = {
  INCOME: {
    label: "Ganho",
    icon: TrendingUp,
    activeCls: "bg-green-600 text-white",
    iconCls: "text-accent-lime",
    submitLabel: "Salvar Ganho",
    submitCls: "bg-accent-lime text-black",
  },
  EXPENSE: {
    label: "Gasto",
    icon: TrendingDown,
    activeCls: "bg-red-600 text-white",
    iconCls: "text-accent-red",
    submitLabel: "Salvar Gasto",
    submitCls: "bg-accent-lime text-black",
  },
  TRANSFER: {
    label: "Transferência",
    icon: ArrowLeftRight,
    activeCls: "bg-blue-600 text-white",
    iconCls: "text-status-info",
    submitLabel: "Transferir",
    submitCls: "bg-blue-600 text-white",
  },
} as const;

const selectCls =
  "w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-lime";

export function TransactionModal({
  open,
  onClose,
  defaultTab = "EXPENSE",
  defaultWalletId,
  transaction,
}: {
  open: boolean;
  onClose: () => void;
  defaultTab?: Tab;
  // Pré-seleciona a forma de pagamento (carteira ou cartão) ao abrir — usado pela CartaoPage
  // pra abrir já com o próprio cartão marcado, já que "Forma de pagamento" fica dentro de um
  // <select> combinado (carteiras + cartões) que não é óbvio de achar vindo da tela do cartão.
  defaultWalletId?: string;
  transaction?: Transaction | null;
}) {
  const isEditing = Boolean(transaction);
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const activeTabRef = useRef<Tab>(activeTab);
  activeTabRef.current = activeTab;

  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const expenseCatsQuery = useCategories();
  const incomeCatsQuery = useIncomeCategories();
  const walletsQuery = useWallets();
  const wallets = walletsQuery.data ?? [];
  const hasEnoughWallets = wallets.length >= 2;
  // EXPENSE usa o seletor combinado (carteiras + cartões); INCOME/TRANSFER seguem
  // restritos a carteiras — pagar/transferir de um cartão não faz sentido aqui.
  const paymentMethodsQuery = useWalletsWithCartoes();
  const paymentMethods = paymentMethodsQuery.data ?? [];
  const hasWallets = activeTab === "EXPENSE" ? paymentMethods.length > 0 : wallets.length > 0;
  const [limitBlock, setLimitBlock] = useState<LimitBlock | null>(null);

  const dynamicResolver = useCallback(
    (values: typeof defaultValues, ctx: unknown, opts: unknown) => {
      const schema =
        activeTabRef.current === "TRANSFER"
          ? transferSchema
          : activeTabRef.current === "EXPENSE"
            ? expenseSchema
            : incomeSchema;
      return (zodResolver(schema) as (v: typeof defaultValues, c: unknown, o: unknown) => Promise<unknown>)(
        values,
        ctx,
        opts,
      );
    },
    [],
  );

  const form = useForm<typeof defaultValues>({
    resolver: dynamicResolver as never,
    defaultValues,
  });

  useEffect(() => {
    if (!open) return;
    setLimitBlock(null);
    if (transaction) {
      const tab = transaction.type;
      setActiveTab(tab);
      form.reset({
        amount: transaction.amount,
        categoryId: transaction.categoryId ?? transaction.category?.id ?? "",
        carteiraId: tab === "TRANSFER" ? "" : (transaction.carteiraId ?? ""),
        carteiraOrigemId: tab === "TRANSFER" ? (transaction.carteiraId ?? "") : "",
        carteiraDestinoId: tab === "TRANSFER" ? (transaction.carteiraDestinoId ?? "") : "",
        date: dateInputValue(transaction.date),
        description: transaction.description ?? "",
        parcelas: transaction.numeroParcela && transaction.totalParcelas ? String(transaction.totalParcelas) : "1",
        confirmarMesmoAssim: false,
      });
    } else {
      setActiveTab(defaultTab);
      form.reset({
        ...defaultValues,
        carteiraId: defaultTab === "EXPENSE" ? (defaultWalletId ?? "") : "",
      });
    }
  }, [open, defaultTab, defaultWalletId, transaction, form]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setLimitBlock(null);
    form.clearErrors();
  };

  const mutation = useMutation({
    mutationFn: async (values: typeof defaultValues) => {
      const tab = activeTabRef.current;
      if (transaction) {
        if (tab === "TRANSFER") {
          await api.patch(`/api/transactions/${transaction.id}`, {
            type: "TRANSFER",
            value: values.amount,
            date: values.date,
            description: values.description || undefined,
            carteiraId: values.carteiraOrigemId || undefined,
            carteiraDestinoId: values.carteiraDestinoId || undefined,
          });
        } else if (transaction.faturaId) {
          // Backend rejeita o PATCH inteiro se value/date/carteiraId vierem no corpo,
          // mesmo iguais ao valor atual — manda só o que é editável.
          await api.patch(`/api/transactions/${transaction.id}`, {
            description: values.description || undefined,
            categoryId: values.categoryId || undefined,
          });
        } else {
          await api.patch(`/api/transactions/${transaction.id}`, {
            ...buildTransactionPayload({ ...values, type: tab }),
            carteiraId: values.carteiraId || undefined,
          });
        }
        return null;
      }

      if (tab === "TRANSFER") {
        await api.post("/api/wallets/transfer", {
          carteiraOrigemId: values.carteiraOrigemId,
          carteiraDestinoId: values.carteiraDestinoId,
          value: values.amount,
          description: values.description || undefined,
          date: values.date,
        });
        return null;
      }

      const selectedWallet = paymentMethods.find((w) => w._id === values.carteiraId);
      const isCard = tab === "EXPENSE" && selectedWallet?.tipo === "credito";
      const totalParcelas = Math.max(1, Number(values.parcelas) || 1);

      if (isCard && totalParcelas > 1) {
        const { data } = await api.post("/api/cartoes/parcelamentos", {
          carteiraId: values.carteiraId,
          categoryId: values.categoryId || undefined,
          // Nunca cai pro nome da categoria (ex: "Eletrônicos") como se fosse o nome da
          // compra — some card list depois lê como se a categoria fosse a descrição.
          descricao: values.description?.trim() || "Compra parcelada",
          valorTotal: values.amount,
          totalParcelas,
          dataCompra: values.date,
          confirmarMesmoAssim: values.confirmarMesmoAssim || undefined,
        });
        return (data as { avisoLimite?: AvisoLimite }).avisoLimite ?? null;
      }

      const { data } = await api.post("/api/transactions", {
        ...buildTransactionPayload({ ...values, type: tab }),
        carteiraId: values.carteiraId,
        confirmarMesmoAssim: isCard ? values.confirmarMesmoAssim || undefined : undefined,
      });
      return (data as { avisoLimite?: AvisoLimite })?.avisoLimite ?? null;
    },
    onSuccess: (avisoLimite) => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-expenses"] });
      if (activeTabRef.current === "EXPENSE") {
        queryClient.invalidateQueries({ queryKey: ["goals"] });
      }
      if (avisoLimite?.avisoProximoLimite) {
        addToast(
          `Atenção: você já usou ${avisoLimite.percentualUsado}% do limite deste cartão (${formatCurrency(avisoLimite.limiteDisponivel)} disponível).`,
          "warning",
        );
      }
      setLimitBlock(null);
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
      setFieldErrorsFromApi(error, form.setError as never, [
        "amount",
        "categoryId",
        "carteiraId",
        "carteiraOrigemId",
        "carteiraDestinoId",
        "date",
        "description",
      ]);
    },
  });

  const carteiraDestinoId = form.watch("carteiraDestinoId");
  const destinoWallet = wallets.find((w) => w._id === carteiraDestinoId);
  const transferDescriptionPlaceholder = destinoWallet
    ? `Transferência para ${destinoWallet.nome}`
    : "Observação opcional";

  const categoryId = form.watch("categoryId");
  const activeCategories = activeTab === "INCOME" ? incomeCatsQuery.data : expenseCatsQuery.data;
  const selectedCategory = activeCategories?.find((c) => c.id === categoryId);
  const expenseIncomeDescriptionPlaceholder = selectedCategory
    ? activeTab === "INCOME"
      ? `Receita de ${selectedCategory.name}`
      : `Gasto com ${selectedCategory.name}`
    : "Observação opcional";

  const descriptionPlaceholder =
    activeTab === "TRANSFER" ? transferDescriptionPlaceholder : expenseIncomeDescriptionPlaceholder;

  // Backend só permite editar descrição/categoria de uma transação de cartão (ver
  // transactions.service.ts#update) — trava os demais campos aqui pra não deixar o
  // usuário mudar algo que vai voltar como 400.
  const isEditingCardTx = Boolean(transaction?.faturaId);
  const watchedCarteiraId = form.watch("carteiraId");
  const watchedDate = form.watch("date");
  const selectedPaymentWallet = paymentMethods.find((w) => w._id === watchedCarteiraId);
  const isCardSelected = activeTab === "EXPENSE" && !isEditing && selectedPaymentWallet?.tipo === "credito";

  const cfg = tabConfig[activeTab];
  const submitLabel = isEditing ? "Salvar Alterações" : cfg.submitLabel;
  const submitDisabled =
    mutation.isPending ||
    (activeTab === "TRANSFER" ? !hasEnoughWallets : !hasWallets);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={isEditing ? "Editar Movimentação" : "Nova Movimentação"}
      icon={<cfg.icon className={cn("h-6 w-6", cfg.iconCls)} />}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-text-primary transition hover:bg-bg-overlay disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="transaction-modal-form"
            disabled={submitDisabled}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70",
              cfg.submitCls,
            )}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      }
    >
      {/* Segmented control */}
      <div className="mb-5 flex rounded-xl bg-bg-muted p-1">
        {(["INCOME", "EXPENSE", "TRANSFER"] as Tab[]).map((tab) => {
          const t = tabConfig[tab];
          const Icon = t.icon;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabChange(tab)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition",
                activeTab === tab ? t.activeCls : "text-text-secondary hover:text-text-primary",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Transfer: sem carteiras suficientes */}
      {activeTab === "TRANSFER" && !hasEnoughWallets ? (
        <div className="rounded-xl bg-bg-muted p-5 text-center text-sm text-text-secondary">
          <ArrowLeftRight className="mx-auto mb-3 h-8 w-8 text-text-muted" />
          <p>
            Você precisa de pelo menos <strong className="text-text-primary">2 carteiras</strong> para realizar uma
            transferência.
          </p>
          <Link
            to="/carteiras"
            onClick={onClose}
            className="mt-3 inline-block font-bold text-accent-lime underline underline-offset-2 hover:brightness-110"
          >
            Criar carteira agora →
          </Link>
        </div>
      ) : (
        <form
          id="transaction-modal-form"
          className="space-y-5"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          {isEditingCardTx && (
            <div className="rounded-xl bg-blue-500/10 p-3 text-xs text-status-info-soft">
              Transações de cartão de crédito só permitem editar descrição e categoria. Para corrigir valor ou
              data, estorne e lance novamente na tela do cartão.
            </div>
          )}

          <AmountField control={form.control} errors={form.formState.errors} disabled={isEditingCardTx} />

          {/* INCOME / EXPENSE */}
          {activeTab !== "TRANSFER" && (
            <>
              {activeTab === "EXPENSE" ? (
                <Controller
                  control={form.control}
                  name="carteiraId"
                  render={({ field, fieldState }) => (
                    <PaymentMethodField
                      wallets={paymentMethods}
                      value={field.value}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                      loading={paymentMethodsQuery.isLoading}
                      disabled={isEditingCardTx}
                    />
                  )}
                />
              ) : (
                <Controller
                  control={form.control}
                  name="carteiraId"
                  render={({ field, fieldState }) => (
                    <WalletField
                      wallets={wallets}
                      value={field.value}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                      loading={walletsQuery.isLoading}
                    />
                  )}
                />
              )}

              {isCardSelected && (
                <div className="space-y-3">
                  <FaturaPreviewHint cartaoId={watchedCarteiraId} data={watchedDate} />
                  <label className="block">
                    <span className="mb-2 block text-sm text-text-secondary">Parcelas</span>
                    <input
                      type="number"
                      min={1}
                      max={48}
                      className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-lime"
                      {...form.register("parcelas")}
                    />
                    <span className="mt-1 block text-xs text-text-secondary">
                      Deixe 1 para compra à vista.
                    </span>
                  </label>
                </div>
              )}

              <Controller
                control={form.control}
                name="categoryId"
                render={({ field, fieldState }) => (
                  <CategoryField
                    categories={
                      (activeTab === "INCOME" ? incomeCatsQuery.data : expenseCatsQuery.data) ?? []
                    }
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    loading={
                      activeTab === "INCOME" ? incomeCatsQuery.isLoading : expenseCatsQuery.isLoading
                    }
                  />
                )}
              />
            </>
          )}

          {/* TRANSFER */}
          {activeTab === "TRANSFER" && (
            <>
              <div>
                <span className="mb-2 block text-sm text-text-secondary">De (origem)</span>
                <select {...form.register("carteiraOrigemId")} className={selectCls}>
                  <option value="">Selecione a carteira de origem...</option>
                  {wallets.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.nome}
                    </option>
                  ))}
                </select>
                {form.formState.errors.carteiraOrigemId && (
                  <p className="mt-1 text-xs text-accent-red">
                    {form.formState.errors.carteiraOrigemId.message}
                  </p>
                )}
              </div>
              <div>
                <span className="mb-2 block text-sm text-text-secondary">Para (destino)</span>
                <select {...form.register("carteiraDestinoId")} className={selectCls}>
                  <option value="">Selecione a carteira de destino...</option>
                  {wallets.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.nome}
                    </option>
                  ))}
                </select>
                {form.formState.errors.carteiraDestinoId && (
                  <p className="mt-1 text-xs text-accent-red">
                    {form.formState.errors.carteiraDestinoId.message}
                  </p>
                )}
              </div>
            </>
          )}

          <DateAndDescriptionFields
            register={form.register as never}
            watch={form.watch as never}
            errors={form.formState.errors}
            descriptionPlaceholder={descriptionPlaceholder}
            disabledDate={isEditingCardTx}
          />

          {limitBlock && (
            <div className="space-y-3 rounded-xl border border-accent-red/40 bg-accent-red/10 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-accent-red" />
                <div className="text-sm text-status-danger-soft">
                  <p className="font-semibold">{limitBlock.message}</p>
                  <p className="mt-1 text-status-danger-soft/80">
                    Limite disponível: {formatCurrency(limitBlock.limiteDisponivel)} de {formatCurrency(limitBlock.limite)}.
                    Esta é uma compra que de fato aconteceu — você pode confirmar mesmo assim.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  form.setValue("confirmarMesmoAssim", true);
                  form.handleSubmit((values) => mutation.mutate({ ...values, confirmarMesmoAssim: true }))();
                }}
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
              {getApiErrorMessages(mutation.error, "Não foi possível salvar.").map((m) => (
                <p key={m}>{m}</p>
              ))}
            </div>
          )}
        </form>
      )}
    </ModalShell>
  );
}
