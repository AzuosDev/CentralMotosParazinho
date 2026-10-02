/*
 * Moldura das páginas públicas temáticas (src/pages/publicas/*).
 *
 * Cada página traz só o seu texto; daqui vêm o cabeçalho e o rodapé da home
 * (src/components/landing/chrome.tsx), o breadcrumb visível, o H1 — único,
 * tirado de src/content/public-pages.ts —, a chamada para o teste grátis e os
 * links para as páginas relacionadas.
 *
 * O breadcrumb é de verdade: a trilha "Início > página" corresponde à
 * hierarquia real do site (todas as temáticas são filhas da home) e é o mesmo
 * par de itens que o BreadcrumbList do JSON-LD declara, em pageJsonLd().
 */
import type { ReactNode } from "react";
import { ChevronRight, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "../../lib/utils";
import { publicPage, type PublicPage } from "../../content/public-pages";
import { useSeo } from "../../hooks/useSeo";
import { LandingFooter, LandingNav, display, focusRing, limeButton, useLandingChrome } from "./chrome";

const linkInline =
  "rounded-sm font-semibold text-[#bef264] underline decoration-[#bef264]/40 underline-offset-4 transition-colors duration-200 hover:decoration-[#bef264] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bef264] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]";

/** Link interno no meio do texto. */
export function A({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={linkInline}>
      {children}
    </Link>
  );
}

/** Link externo no meio do texto. */
export function AExterno({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkInline}>
      {children}
    </a>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-3xl text-pretty text-[1.0625rem] leading-relaxed text-[#c3d2c0]">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-5 max-w-3xl space-y-3">
      {children}
    </ul>
  );
}

export function LI({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-5 text-pretty text-[1.0625rem] leading-relaxed text-[#c3d2c0] before:absolute before:left-0 before:top-[0.65em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#bef264]">
      {children}
    </li>
  );
}

export function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-14 scroll-mt-24 first:mt-0">
      <h2 id={id} className={cn(display, "text-[1.75rem] leading-[1.1] text-white sm:text-[2.1rem]")}>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export function SubSecao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mt-9">
      <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-white sm:text-[1.4rem]">{titulo}</h3>
      {children}
    </div>
  );
}

function Breadcrumb({ page }: { page: PublicPage }) {
  return (
    <nav aria-label="Trilha de navegação" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-[#8fa68d]">
        <li>
          <Link
            to="/"
            className={cn("rounded-sm underline-offset-4 transition-colors hover:text-white hover:underline", focusRing)}
          >
            Início
          </Link>
        </li>
        <li aria-hidden className="flex items-center">
          <ChevronRight className="h-3.5 w-3.5" />
        </li>
        <li>
          <span aria-current="page" className="font-medium text-[#c3d2c0]">
            {page.breadcrumb}
          </span>
        </li>
      </ol>
    </nav>
  );
}

function Cta() {
  return (
    <section
      aria-labelledby="cta-title"
      className="mt-16 rounded-[24px] bg-[#0e2a1e] p-7 ring-1 ring-white/10 sm:p-10"
    >
      <h2 id="cta-title" className={cn(display, "max-w-2xl text-[1.75rem] leading-[1.08] text-white sm:text-[2.25rem]")}>
        Conheça o MeuGasto por dentro.
      </h2>
      <p className="mt-3 max-w-xl text-[#bdd0bb]">
        São 15 dias de teste grátis, sem cartão de crédito. Dá tempo de lançar um mês inteiro e ver se o jeito do app
        combina com o seu.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link to="/register" className={cn(limeButton, "px-6 py-3 text-base")}>
          Começar teste grátis
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          to="/login"
          className={cn(
            "inline-flex items-center justify-center rounded-pill px-6 py-3 text-base font-semibold text-[#eef5ec] ring-1 ring-white/20 transition-colors duration-200 hover:bg-white/10",
            focusRing,
          )}
        >
          Já tenho conta
        </Link>
      </div>
    </section>
  );
}

function Relacionadas({ page }: { page: PublicPage }) {
  if (page.relacionadas.length === 0) return null;

  return (
    <nav aria-labelledby="relacionadas-title" className="mt-16 border-t border-white/10 pt-10">
      <h2 id="relacionadas-title" className="font-display text-xl font-bold tracking-[-0.02em] text-white">
        Continue por aqui
      </h2>
      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {page.relacionadas.map((id) => {
          const alvo = publicPage(id);
          return (
            <li key={id}>
              <Link
                to={alvo.path}
                className={cn(
                  "group flex h-full flex-col rounded-[18px] bg-white/[0.04] p-5 ring-1 ring-white/10 transition-colors duration-200 hover:bg-white/[0.07] hover:ring-white/20",
                  focusRing,
                )}
              >
                <span className="font-display text-lg font-bold tracking-[-0.02em] text-white">{alvo.breadcrumb}</span>
                <span className="mt-1.5 flex-1 text-sm leading-relaxed text-[#a9b8a6]">{alvo.resumo}</span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#bef264]">
                  Ler
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function PublicPageLayout({
  page,
  lead,
  children,
}: {
  page: PublicPage;
  /** Primeiro parágrafo, logo abaixo do H1. */
  lead: ReactNode;
  children: ReactNode;
}) {
  useLandingChrome();
  useSeo(page);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#0a0a0a] font-body text-[#eef5ec] selection:bg-[#bef264] selection:text-[#10231a]">
      <LandingNav sections="home" />

      <main>
        <article className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8 sm:px-6 sm:pb-32 lg:px-10">
          <Breadcrumb page={page} />

          <header className="mt-8">
            <h1 className={cn(display, "text-[2.25rem] leading-[1.03] text-white sm:text-[3rem]")}>{page.h1}</h1>
            <p className="mt-6 max-w-3xl text-pretty text-lg leading-relaxed text-[#bdd0bb] sm:text-xl">{lead}</p>
          </header>

          <div className="mt-14">{children}</div>

          <Cta />
          <Relacionadas page={page} />
        </article>
      </main>

      <LandingFooter currentPath={page.path} />
    </div>
  );
}
