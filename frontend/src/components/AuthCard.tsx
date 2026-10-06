import type { ReactNode } from "react";

import { AuthShowcase } from "./AuthShowcase";
import { BrandBadge } from "./BrandMark";

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
        <span className="flex w-fit items-center gap-3">
          <BrandBadge className="h-11 w-11" />
          <span className="flex flex-col leading-none">
            <span className="text-sm font-extrabold uppercase tracking-[0.2em] text-text-primary">
              Central
            </span>
            <span className="text-sm font-extrabold uppercase tracking-[0.2em] text-accent-brand">
              Motos
            </span>
          </span>
        </span>

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
