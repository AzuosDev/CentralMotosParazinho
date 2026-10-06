import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Coins,
  LayoutDashboard,
  Receipt,
  ArrowLeftRight,
  PiggyBank,
  Target,
  Clock,
  LogOut,
} from "lucide-react";
import { clearTokens } from "../lib/auth";
import { cn } from "../lib/utils";
import type { ReactNode } from "react";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/expenses", label: "Despesas", icon: Receipt },
  { to: "/transactions", label: "Transações", icon: ArrowLeftRight },
  { to: "/budget", label: "Orçamento", icon: PiggyBank },
  { to: "/goals", label: "Metas", icon: Target },
  { to: "/pending", label: "Pendentes", icon: Clock },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const handleLogout = () => {
    clearTokens();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-bg-overlay bg-bg-card p-6 md:flex">
        <div className="mb-10 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-icon bg-accent-brand/10">
            <Coins className="h-5 w-5 text-accent-brand" />
          </span>
          <span className="font-sans text-lg font-bold tracking-tight">
            MeuGasto
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-icon px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-accent-brand text-white font-semibold"
                    : "text-text-secondary hover:bg-bg-muted hover:text-text-primary",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="mt-4 flex items-center gap-3 rounded-icon px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-muted hover:text-accent-red"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </aside>

      <main className="md:ml-64">
        <div className="mx-auto max-w-6xl p-6 md:p-10">{children}</div>
      </main>
    </div>
  );
}
