import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { z } from "zod";

import { api } from "../../lib/api";
import { getApiErrorMessages, setFieldErrorsFromApi } from "../../lib/errors";
import { buildTransactionPayload, dateInputValue, localDateString } from "../../lib/finance";
import type { Transaction } from "../../types/finance";
import type { Transaction as ApiTransaction } from "../../types/api";
import {
  AmountField,
  CategoryField,
  DateAndDescriptionFields,
  WalletField,
  type TransactionFormValues,
  useCategories,
  useWallets,
} from "./TransactionFormFields";
import { ModalShell } from "./ModalShell";

const baseSchema = z.object({
  amount: z.number().positive("Informe um valor maior que zero."),
  categoryId: z.string().default(""),
  carteiraId: z.string().optional().default(""),
  date: z.string().min(1, "Informe a data."),
  description: z.string().max(500, "Use atÃ© 500 caracteres.").optional(),
});

export function EditTransactionModal({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const categoriesQuery = useCategories();
  const walletsQuery = useWallets();
  const isExpense = transaction?.type === "EXPENSE";
  const schema = baseSchema.refine((values) => !isExpense || Boolean(values.categoryId), {
    message: "Escolha uma categoria.",
    path: ["categoryId"],
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: 0,
      categoryId: "",
      carteiraId: "",
      date: localDateString(),
      description: "",
    },
  });

  useEffect(() => {
    if (transaction) {
      form.reset({
        amount: transaction.amount,
        categoryId: transaction.categoryId ?? transaction.category?.id ?? "",
        carteiraId: transaction.carteiraId ?? "",
        date: dateInputValue(transaction.date),
        description: transaction.description ?? "",
      });
    }
  }, [form, transaction]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!transaction) {
        return;
      }

      await api.patch<ApiTransaction>(
        `/api/transactions/${transaction.id}`,
        {
          ...buildTransactionPayload({ ...values, type: transaction.type }),
          carteiraId: values.carteiraId || undefined,
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      onClose();
    },
    onError: (error) => {
      setFieldErrorsFromApi(error, form.setError, ["amount", "categoryId", "carteiraId", "date", "description"]);
    },
  });

  return (
    <ModalShell
      open={Boolean(transaction)}
      onClose={onClose}
      title={isExpense ? "Editar Gasto" : "Editar Ganho"}
      icon={
        isExpense ? (
          <TrendingDown className="h-6 w-6 text-accent-red" />
        ) : (
          <TrendingUp className="h-6 w-6 text-accent-brand" />
        )
      }
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
            form="edit-transaction-form"
            disabled={mutation.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar AlteraÃ§Ãµes
          </button>
        </div>
      }
    >
      <form id="edit-transaction-form" className="space-y-5" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
        <AmountField control={form.control} errors={form.formState.errors} />

        <Controller
          control={form.control}
          name="carteiraId"
          render={({ field, fieldState }) => (
            <WalletField
              wallets={walletsQuery.data ?? []}
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error?.message}
              loading={walletsQuery.isLoading}
            />
          )}
        />

        {isExpense && (
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <CategoryField
                categories={categoriesQuery.data ?? []}
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
                loading={categoriesQuery.isLoading}
              />
            )}
          />
        )}

        <DateAndDescriptionFields
          register={form.register}
          watch={form.watch}
          errors={form.formState.errors}
        />

        {mutation.isError && (
          <div className="rounded-xl bg-accent-red/10 p-3 text-sm text-accent-red">
            {getApiErrorMessages(mutation.error, "Nao foi possivel atualizar a transacao.").map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
      </form>
    </ModalShell>
  );
}


