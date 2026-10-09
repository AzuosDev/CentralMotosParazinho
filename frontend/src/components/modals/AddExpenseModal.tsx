import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { Loader2, TrendingDown } from "lucide-react";
import { z } from "zod";

import { api } from "../../lib/api";
import { getApiErrorMessages, setFieldErrorsFromApi } from "../../lib/errors";
import { buildTransactionPayload, localDateString } from "../../lib/finance";
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
import type { Transaction as ApiTransaction } from "../../types/api";

const schema = z.object({
  amount: z.number().positive("Informe um valor maior que zero."),
  categoryId: z.string().min(1, "Escolha uma categoria."),
  carteiraId: z.string().min(1, "Selecione uma carteira."),
  date: z.string().min(1, "Informe a data."),
  description: z.string().max(500, "Use atÃ© 500 caracteres.").optional(),
});

type FormValues = z.infer<typeof schema>;

function todayInputValue() {
  return localDateString();
}

export function AddExpenseModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const categoriesQuery = useCategories();
  const walletsQuery = useWallets();
  const hasWallets = (walletsQuery.data?.length ?? 0) > 0;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: 0,
      categoryId: "",
      carteiraId: "",
      date: todayInputValue(),
      description: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        amount: 0,
        categoryId: "",
        carteiraId: "",
        date: todayInputValue(),
        description: "",
      });
    }
  }, [form, open]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      await api.post<ApiTransaction>("/api/transactions", {
        ...buildTransactionPayload({ ...values, type: "EXPENSE" }),
        carteiraId: values.carteiraId,
      });
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
      open={open}
      onClose={onClose}
      title="Novo Gasto"
      icon={<TrendingDown className="h-6 w-6 text-accent-red" />}
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
            form="add-expense-form"
            disabled={mutation.isPending || !hasWallets}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar Gasto
          </button>
        </div>
      }
    >
      <form
        id="add-expense-form"
        className="space-y-5"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
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

        <DateAndDescriptionFields
          register={form.register}
          watch={form.watch}
          errors={form.formState.errors}
        />

        {mutation.isError && (
          <div className="rounded-xl bg-accent-red/10 p-3 text-sm text-accent-red">
            {getApiErrorMessages(mutation.error, "Nao foi possivel salvar o gasto.").map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
      </form>
    </ModalShell>
  );
}


