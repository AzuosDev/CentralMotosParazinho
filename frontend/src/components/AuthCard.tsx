import { Coins } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { AuthShowcase } from "./AuthShowcase";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg-card lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:px-14">
        <Link
          to="/landing"
          className="flex w-fit items-center gap-2 rounded-icon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-lime"
        >
          <span className="grid h-9 w-9 place-items-center rounded-icon bg-accent-lime/10">
            <Coins className="h-[18px] w-[18px] text-accent-lime" />
          </span>
          <span className="font-body text-lg font-bold tracking-tight text-text-primary">
            MeuGasto
          </span>
        </Link>

        <main className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[400px] py-10">
            <header className="mb-8">
              <h1 className="text-balance font-body text-[1.875rem] font-bold leading-tight tracking-[-0.02em] text-text-primary">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>
              )}
            </header>

            {children}

            {footer && (
              <div className="mt-8 text-center text-sm text-text-secondary">
                {footer}
              </div>
            )}
          </div>
        </main>
      </div>

      <div className="hidden lg:sticky lg:top-0 lg:block lg:h-dvh lg:p-3">
        <AuthShowcase />
      </div>
    </div>
  );
}
