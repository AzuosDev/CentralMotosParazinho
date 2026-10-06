import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { z } from "zod";
import { Link } from "react-router-dom";

import { api } from "../../lib/api";
import { getApiErrorMessages } from "../../lib/errors";
import { localDateString } from "../../lib/finance";
import { useWallets } from "./TransactionFormFields";
import { CurrencyInput } from "../ui/CurrencyInput";
import { ModalShell } from "./ModalShell";

const schema = z
  .object({
    value: z.number({ invalid_type_error: "Informe um valor." }).positive("Informe um valor maior que zero."),
    carteiraOrigemId: z.string().min(1, "Selecione a carteira de origem."),
    carteiraDestinoId: z.string().min(1, "Selecione a carteira de destino."),
    description: z.string().max(500).optional(),
    date: z.string().min(1, "Informe a data."),
  })
  .refine((d) => d.carteiraOrigemId !== d.carteiraDestinoId, {
    message: "As carteiras de origem e destino devem ser diferentes.",
    path: ["carteiraDestinoId"],
  });

type FormValues = z.infer<typeof schema>;

function todayInputValue() {
  return localDateString();
}

const inputCls =
  "w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-brand";
const labelCls = "block text-sm text-text-secondary mb-1";

export function TransferModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const walletsQuery = useWallets();
  const wallets = walletsQuery.data ?? [];
  const hasEnoughWallets = wallets.length >= 2;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      value: 0,
      carteiraOrigemId: "",
      carteiraDestinoId: "",
      description: "",
      date: todayInputValue(),
    },
  });

  const carteiraDestinoId = form.watch("carteiraDestinoId");
  const destinoWallet = wallets.find((w) => w._id === carteiraDestinoId);
  const descriptionPlaceholder = destinoWallet
    ? `Transferência para ${destinoWallet.nome}`
    : "Ex: Reserva de emergência";

  useEffect(() => {
    if (open) {
      form.reset({
        value: 0,
        carteiraOrigemId: "",
        carteiraDestinoId: "",
        description: "",
        date: todayInputValue(),
      });
    }
  }, [form, open]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      await api.post("/api/wallets/transfer", {
        carteiraOrigemId: values.carteiraOrigemId,
        carteiraDestinoId: values.carteiraDestinoId,
        value: values.value,
        description: values.description || undefined,
        date: values.date,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
  });

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Transferência entre Carteiras"
      icon={<ArrowLeftRight className="h-6 w-6 text-status-info" />}
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
            form="transfer-form"
            disabled={mutation.isPending || !hasEnoughWallets}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Transferir
          </button>
        </div>
      }
    >
      {!hasEnoughWallets ? (
        <div className="rounded-xl bg-bg-muted p-5 text-center text-sm text-text-secondary">
          <ArrowLeftRight className="mx-auto mb-3 h-8 w-8 text-text-muted" />
          <p>
            Você precisa de pelo menos <strong className="text-text-primary">2 carteiras</strong> para realizar uma
            transferência.
          </p>
          <Link
            to="/carteiras"
            onClick={onClose}
            className="mt-3 inline-block font-bold text-accent-brand underline underline-offset-2 hover:text-text-primary"
          >
            Criar carteira agora →
          </Link>
        </div>
      ) : (
        <form
          id="transfer-form"
          className="space-y-4"
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <div>
            <label className={labelCls}>Valor</label>
            <Controller
              control={form.control}
              name="value"
              render={({ field }) => (
                <CurrencyInput
                  value={field.value ?? 0}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className={inputCls}
                />
              )}
            />
            {form.formState.errors.value && (
              <p className="mt-1 text-xs text-accent-red">{form.formState.errors.value.message}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>De (origem)</label>
            <select {...form.register("carteiraOrigemId")} className={inputCls}>
              <option value="">Selecione a carteira de origem...</option>
              {wallets.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.icone ? `${w.icone} ` : ""}
                  {w.nome}
                </option>
              ))}
            </select>
            {form.formState.errors.carteiraOrigemId && (
              <p className="mt-1 text-xs text-accent-red">{form.formState.errors.carteiraOrigemId.message}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Para (destino)</label>
            <select {...form.register("carteiraDestinoId")} className={inputCls}>
              <option value="">Selecione a carteira de destino...</option>
              {wallets.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.icone ? `${w.icone} ` : ""}
                  {w.nome}
                </option>
              ))}
            </select>
            {form.formState.errors.carteiraDestinoId && (
              <p className="mt-1 text-xs text-accent-red">{form.formState.errors.carteiraDestinoId.message}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Data</label>
            <input type="date" {...form.register("date")} className={inputCls} />
            {form.formState.errors.date && (
              <p className="mt-1 text-xs text-accent-red">{form.formState.errors.date.message}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Observação (opcional)</label>
            <input
              type="text"
              {...form.register("description")}
              className={inputCls}
              placeholder={descriptionPlaceholder}
            />
          </div>

          {mutation.isError && (
            <div className="rounded-xl bg-accent-red/10 p-3 text-sm text-accent-red">
              {getApiErrorMessages(mutation.error, "Não foi possível realizar a transferência.").map((m) => (
                <p key={m}>{m}</p>
              ))}
            </div>
          )}
        </form>
      )}
    </ModalShell>
  );
}
