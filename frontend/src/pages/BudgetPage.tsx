import { BarChart3 } from "lucide-react";

export function BudgetPage() {
  return (
    <section className="space-y-4">
      <header>
        <p className="text-sm text-text-secondary">Planejamento</p>
        <h1 className="text-3xl font-bold">Orçamento</h1>
      </header>
      <div className="rounded-2xl border border-bg-overlay bg-bg-card p-5">
        <BarChart3 className="mb-3 h-6 w-6 text-accent-brand" />
        <p className="text-sm text-text-secondary">Área preparada para metas de orçamento mensal.</p>
      </div>
    </section>
  );
}
