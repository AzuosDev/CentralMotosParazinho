import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Link2,
  Loader2,
  PencilLine,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { CurrencyInput } from "../components/ui/CurrencyInput";
import { ModalShell } from "../components/modals/ModalShell";
import { useToast } from "../components/ui/Toast";
import { ConfirmDeleteModal } from "../components/modals/ConfirmDeleteModal";
import { api } from "../lib/api";
import { formatCurrency, formatDisplayDate } from "../lib/finance";
import { getApiErrorMessages, setFieldErrorsFromApi } from "../lib/errors";

type GoalItem = {
  id: string;
  name: string;
  targetValue: number;
  currentValue: number;
  deadline?: string;
  completed: boolean;
  percentComplete?: number;
  linkedCategoryId?: string | null;
};

type GoalAction = {
  type: "create" | "edit" | "value";
  goal?: GoalItem | null;
};

type GoalFormValues = {
  name: string;
  targetValue: number;
  currentValue: number;
  deadline?: string;
};

type GoalFormInput = z.input<typeof goalFormSchema>;
type GoalValueInput = z.input<typeof goalValueSchema>;
type GoalValueFormValues = z.output<typeof goalValueSchema>;

const goalFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da meta.")
    .max(200, "Use até 200 caracteres."),
  targetValue: z.coerce.number().min(1, "Informe um valor maior que zero."),
  currentValue: z.coerce.number().min(0, "O valor atual não pode ser negativo."),
  deadline: z.string().optional(),
});

const goalValueSchema = z.object({
  currentValue: z.coerce.number().min(0, "O valor atual não pode ser negativo."),
});

function normalizeGoals(data: unknown): GoalItem[] {
  if (Array.isArray(data)) {
    return data.map((item) => {
      const goal = item as Record<string, unknown>;
      const id = typeof goal._id === "string" ? goal._id : typeof goal.id === "string" ? goal.id : "";
      const name = typeof goal.name === "string" ? goal.name : "";
      const targetValue = Number(goal.targetValue ?? 0);
      const currentValue = Number(goal.currentValue ?? 0);
      const deadline = typeof goal.deadline === "string" ? goal.deadline : undefined;
      const completed = Boolean(goal.completed);
      const percentComplete = typeof goal.percentComplete === "number" ? goal.percentComplete : undefined;
      const linkedCategoryId = typeof goal.linkedCategoryId === "string" ? goal.linkedCategoryId : null;

      return {
        id,
        name,
        targetValue: Number.isFinite(targetValue) ? targetValue : 0,
        currentValue: Number.isFinite(currentValue) ? currentValue : 0,
        deadline,
        completed,
        percentComplete,
        linkedCategoryId,
      };
    });
  }

  if (data && typeof data === "object" && "items" in data && Array.isArray((data as { items?: unknown }).items)) {
    return normalizeGoals((data as { items: unknown[] }).items);
  }

  return [];
}

function toDateInputValue(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function formatDeadline(value?: string) {
  if (!value) {
    return "Sem prazo";
  }

  return `Meta: ${formatDisplayDate(value)}`;
}

function getProgressColor(goal: GoalItem) {
  const percent = Math.max(0, Math.min(100, Math.round(goal.percentComplete ?? 0)));

  if (goal.completed || percent >= 100) {
    return {
      percent,
      stroke: "rgb(var(--color-income))",
      badgeClass: "bg-semantic-income/10 text-semantic-income",
      borderClass: "border-semantic-income/30",
      label: "Concluída",
    };
  }

  if (percent >= 70) {
    return {
      percent,
      stroke: "rgb(var(--accent-yellow))",
      badgeClass: "bg-accent-yellow/10 text-accent-yellow",
      borderClass: "border-bg-muted",
      label: `${percent}%`,
    };
  }

  return {
    percent,
    stroke: "rgb(var(--accent-brand-line))",
    badgeClass: "bg-accent-brand/10 text-accent-brand",
    borderClass: "border-bg-muted",
    label: `${percent}%`,
  };
}

function GoalFormModal({
  open,
  goal,
  mode,
  onClose,
}: {
  open: boolean;
  goal: GoalItem | null;
  mode: "create" | "edit";
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const form = useForm<GoalFormInput, unknown, GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: {
      name: "",
      targetValue: 1,
      currentValue: 0,
      deadline: "",
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset({
      name: goal?.name ?? "",
      targetValue: goal?.targetValue ?? 1,
      currentValue: goal?.currentValue ?? 0,
      deadline: toDateInputValue(goal?.deadline),
    });
  }, [form, goal, open]);

  const mutation = useMutation({
    mutationFn: async (values: GoalFormValues) => {
      const payload = {
        name: values.name.trim(),
        targetValue: values.targetValue,
        currentValue: values.currentValue,
        ...(values.deadline?.trim() ? { deadline: values.deadline.trim() } : {}),
      };

      if (goal) {
        await api.patch(`/api/goals/${goal.id}`, payload);
        return;
      }

      await api.post("/api/goals", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (mode === "create") {
        queryClient.invalidateQueries({ queryKey: ["categories"] });
      }
      addToast(mode === "create" ? "Meta criada com sucesso." : "Meta atualizada com sucesso.", "success");
      onClose();
    },
    onError: (error) => {
      setFieldErrorsFromApi(error, form.setError, ["name", "targetValue", "currentValue", "deadline"]);
    },
  });

  if (!open) {
    return null;
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={mode === "create" ? "Nova Meta" : "Editar Meta"}
      icon={<Target className="h-6 w-6 text-accent-brand" />}
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
            form="goal-form"
            disabled={mutation.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "create" ? "Criar Meta" : "Salvar Alterações"}
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-text-secondary">
        {mode === "create"
          ? "Defina um objetivo financeiro e acompanhe o progresso automaticamente via gastos."
          : "Atualize as informações da sua meta financeira."}
      </p>

      <form id="goal-form" className="space-y-4" onSubmit={form.handleSubmit((values) => {
        mutation.mutate(values);
      })}>
        <label className="block">
          <span className="mb-1 block text-sm text-text-secondary">Nome da meta</span>
          <input
            type="text"
            maxLength={200}
            placeholder="Ex.: Reserva de emergência"
            {...form.register("name")}
            className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none focus:border-accent-brand"
          />
          {form.formState.errors.name?.message && (
            <p className="mt-1 text-xs text-accent-red">{form.formState.errors.name.message}</p>
          )}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-text-secondary">Valor da meta</span>
            <Controller
              control={form.control}
              name="targetValue"
              render={({ field }) => (
                <CurrencyInput
                  value={Number(field.value ?? 0)}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none focus:border-accent-brand"
                />
              )}
            />
            {form.formState.errors.targetValue?.message && (
              <p className="mt-1 text-xs text-accent-red">{form.formState.errors.targetValue.message}</p>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-text-secondary">Valor atual</span>
            <Controller
              control={form.control}
              name="currentValue"
              render={({ field }) => (
                <CurrencyInput
                  value={Number(field.value ?? 0)}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none focus:border-accent-brand"
                />
              )}
            />
            {form.formState.errors.currentValue?.message && (
              <p className="mt-1 text-xs text-accent-red">{form.formState.errors.currentValue.message}</p>
            )}
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-text-secondary">Prazo (opcional)</span>
          <input
            type="date"
            {...form.register("deadline")}
            className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none focus:border-accent-brand"
          />
          {form.formState.errors.deadline?.message && (
            <p className="mt-1 text-xs text-accent-red">{form.formState.errors.deadline.message}</p>
          )}
        </label>

        {mutation.isError && (
          <div className="rounded-xl bg-accent-red/10 p-3 text-sm text-accent-red">
            {getApiErrorMessages(
              mutation.error,
              mode === "create" ? "Nao foi possivel criar a meta." : "Nao foi possivel atualizar a meta.",
            ).map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
      </form>
    </ModalShell>
  );
}

function GoalValueModal({
  open,
  goal,
  onClose,
}: {
  open: boolean;
  goal: GoalItem | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const form = useForm<GoalValueInput, unknown, GoalValueFormValues>({
    resolver: zodResolver(goalValueSchema),
    defaultValues: {
      currentValue: goal?.currentValue ?? 0,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        currentValue: goal?.currentValue ?? 0,
      });
    }
  }, [form, goal, open]);

  const mutation = useMutation({
    mutationFn: async (values: { currentValue: number }) => {
      if (!goal) {
        return;
      }

      await api.patch(`/api/goals/${goal.id}`, {
        currentValue: values.currentValue,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast("Valor da meta atualizado com sucesso.", "success");
      onClose();
    },
    onError: (error) => {
      setFieldErrorsFromApi(error, form.setError, ["currentValue"]);
    },
  });

  if (!open || !goal) {
    return null;
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Atualizar Valor"
      icon={<Target className="h-6 w-6 text-accent-brand" />}
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
            form="goal-value-form"
            disabled={mutation.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar Valor
          </button>
        </div>
      }
    >
      <div className="mb-4 rounded-2xl border border-bg-muted bg-bg-muted/70 p-4">
        <p className="text-sm text-text-secondary">Meta</p>
        <h3 className="mt-1 text-lg font-semibold text-text-primary">{goal.name}</h3>
        <p className="mt-2 text-sm text-text-secondary">
          Atual: <span className="font-semibold text-text-primary">{formatCurrency(goal.currentValue)}</span> de{" "}
          <span className="font-semibold text-text-primary">{formatCurrency(goal.targetValue)}</span>
        </p>
        <p className="mt-2 text-xs text-text-secondary">
          Ao atingir o valor alvo, a meta é marcada como concluída automaticamente.
        </p>
      </div>

      <form id="goal-value-form" onSubmit={form.handleSubmit((values) => {
        mutation.mutate(values);
      })}>
        <label className="block">
          <span className="mb-2 block text-sm text-text-secondary">Novo valor atual</span>
          <div className="flex items-center rounded-2xl border border-bg-muted bg-bg-muted px-4 py-3 focus-within:border-accent-brand">
            <Controller
              control={form.control}
              name="currentValue"
              render={({ field }) => (
                <CurrencyInput
                  value={Number(field.value ?? 0)}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className="w-full bg-transparent text-center font-sans text-3xl font-bold text-text-primary outline-none"
                />
              )}
            />
          </div>
          {form.formState.errors.currentValue?.message && (
            <p className="mt-2 text-xs text-accent-red">{form.formState.errors.currentValue.message}</p>
          )}
        </label>

        {mutation.isError && (
          <div className="rounded-xl bg-accent-red/10 p-3 text-sm text-accent-red mt-4">
            {getApiErrorMessages(mutation.error, "Nao foi possivel atualizar a meta.").map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
      </form>
    </ModalShell>
  );
}

export function GoalsPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [activeAction, setActiveAction] = useState<GoalAction | null>(null);
  const [deleteGoalModalOpen, setDeleteGoalModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<{ id: string; name: string } | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("action") === "create") {
      openCreateModal();
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("action");
        return next;
      }, { replace: true });
    }
  }, []);

  const goalsQuery = useQuery<GoalItem[]>({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data } = await api.get<unknown>("/api/goals");
      return normalizeGoals(data);
    },
  });

  const emptyGoals = useMemo<GoalItem[]>(() => [], []);

  const goals = goalsQuery.data ?? emptyGoals;

  const summary = useMemo(() => {
    const totalCurrent = goals.reduce((sum, goal) => sum + (goal.currentValue ?? 0), 0);
    const completedGoals = goals.filter((goal) => goal.completed).length;
    const totalTarget = goals.reduce((sum, goal) => sum + (goal.targetValue ?? 0), 0);
    const overallProgress = totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0;

    return {
      totalTarget,
      totalCurrent,
      completedGoals,
      totalGoals: goals.length,
      overallProgress,
    };
  }, [goals]);

  const deleteGoal = useMutation({
    mutationFn: async (goalId: string) => {
      await api.delete(`/api/goals/${goalId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast("Meta excluída com sucesso.", "success");
      setActiveAction(null);
    },
    onError: (error) => {
      addToast(getApiErrorMessages(error, "Nao foi possivel excluir a meta.")[0] ?? "Nao foi possivel excluir a meta.", "error");
    },
  });

  const currentGoal = activeAction?.goal ?? null;
  const formMode = activeAction?.type === "create" ? "create" : "edit";

  const openCreateModal = () => setActiveAction({ type: "create", goal: null });
  const openEditModal = (goal: GoalItem) => setActiveAction({ type: "edit", goal });
  const openValueModal = (goal: GoalItem) => setActiveAction({ type: "value", goal });
  const closeModal = () => setActiveAction(null);

  const handleDelete = (goal: GoalItem) => {
    setSelectedGoal({ id: goal.id, name: goal.name });
    setDeleteGoalModalOpen(true);
  };

  const confirmDelete = () => {
    if (!selectedGoal) return;
    deleteGoal.mutate(selectedGoal.id);
    setDeleteGoalModalOpen(false);
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">Objetivos financeiros</p>
          <h1 className="font-sans text-3xl font-bold">Metas financeiras</h1>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-accent-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover"
        >
          <Plus className="h-4 w-4" />
          Nova Meta
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <article className="rounded-2xl bg-bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Total de metas</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{summary.totalGoals}</p>
        </article>
        <article className="rounded-2xl bg-bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Concluídas</p>
          <p className="mt-2 text-2xl font-bold text-semantic-income">{summary.completedGoals}</p>
        </article>
        <article className="rounded-2xl bg-bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Acumulado</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{formatCurrency(summary.totalCurrent)}</p>
        </article>
        <article className="rounded-2xl bg-bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Progresso geral</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{summary.overallProgress}%</p>
        </article>
      </div>

      {goalsQuery.isLoading ? (
        <div className="rounded-2xl border border-bg-muted bg-bg-card p-5 text-sm text-text-secondary">Carregando metas...</div>
      ) : goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-bg-muted bg-bg-card p-8 text-center">
          <Target className="mx-auto h-10 w-10 text-accent-brand" />
          <h2 className="mt-4 text-xl font-semibold text-text-primary">Nenhuma meta cadastrada</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Crie sua primeira meta para começar a acompanhar o progresso e receber a marcação automática de conclusão.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover"
          >
            <Plus className="h-4 w-4" />
            Criar primeira meta
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((goal) => {
            const progress = getProgressColor(goal);
            const remaining = Math.max(0, goal.targetValue - goal.currentValue);
            const strokeDasharray = 301.6;
            const strokeDashoffset = strokeDasharray - (strokeDasharray * progress.percent) / 100;

            return (
              <article
                key={goal.id}
                className={`rounded-2xl border bg-bg-card p-5 ${progress.borderClass} ${
                  goal.completed ? "shadow-[0_0_0_1px_rgba(163,230,53,0.08)]" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-text-secondary">Meta</p>
                    <h3 className="truncate text-xl font-semibold text-text-primary">{goal.name}</h3>
                    {goal.linkedCategoryId && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
                        <Link2 className="h-3 w-3" />
                        Rastreamento automático via gastos
                      </p>
                    )}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${progress.badgeClass}`}>
                    {goal.completed ? "Concluída" : progress.label}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-4">
                  <svg viewBox="0 0 120 120" className="h-24 w-24 -rotate-90">
                    <circle cx="60" cy="60" r="48" stroke="rgb(var(--chart-track) / 0.18)" strokeWidth="10" fill="none" />
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      stroke={progress.stroke}
                      strokeWidth="10"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                    />
                    <text x="60" y="64" textAnchor="middle" style={{ fill: "rgb(var(--text-primary))", fontSize: 18, fontWeight: 700 }} transform="rotate(90, 60, 64)">
                      {progress.percent}%
                    </text>
                  </svg>

                  <div className="space-y-2 text-sm text-text-secondary">
                    <p>
                      Atual: <span className="font-semibold text-text-primary">{formatCurrency(goal.currentValue)}</span>
                    </p>
                    <p>
                      Meta: <span className="font-semibold text-text-primary">{formatCurrency(goal.targetValue)}</span>
                    </p>
                    <p>
                      Faltam: <span className="font-semibold text-text-primary">{formatCurrency(remaining)}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-text-secondary" />
                      <span>{formatDeadline(goal.deadline)}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openValueModal(goal)}
                    className="inline-flex items-center gap-2 rounded-xl bg-bg-muted px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-bg-overlay"
                  >
                    <Target className="h-4 w-4" />
                    Atualizar valor
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(goal)}
                    className="inline-flex items-center gap-2 rounded-xl border border-bg-muted px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-bg-overlay"
                  >
                    <PencilLine className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(goal)}
                    disabled={deleteGoal.isPending}
                    className="inline-flex items-center gap-2 rounded-xl border border-accent-red/30 px-4 py-2 text-sm font-semibold text-accent-red transition hover:bg-accent-red/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <GoalFormModal
        open={activeAction?.type === "create" || activeAction?.type === "edit"}
        goal={currentGoal}
        mode={formMode}
        onClose={closeModal}
      />

      <GoalValueModal
        open={activeAction?.type === "value"}
        goal={currentGoal}
        onClose={closeModal}
      />
    <ConfirmDeleteModal
        open={deleteGoalModalOpen}
        onClose={() => setDeleteGoalModalOpen(false)}
        onDeleteOne={confirmDelete}
        accountName={selectedGoal?.name ?? ""}
      />
</section>
  );
}
