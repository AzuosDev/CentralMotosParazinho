/*
 * Chrome compartilhado das páginas públicas: cabeçalho, rodapé, logo e os
 * tokens de estilo da "mesa verde-floresta".
 *
 * Isto saiu de src/pages/LandingPage.tsx sem mudança visual, para que as
 * páginas temáticas (src/pages/publicas/*) usem o mesmo cabeçalho e o mesmo
 * rodapé da home em vez de uma cópia. As cores continuam literais aqui, e não
 * nos tokens de tema: esta é uma superfície de marca, igual nos dois temas.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Coins } from "lucide-react";

import { cn } from "../../lib/utils";
import { PUBLIC_PAGES } from "../../content/public-pages";

export const AZUOS_URL = "https://azuos-dev.vercel.app/";
const DISPLAY_FONT_CSS = "/fonts/bricolage-grotesque.css";

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bef264] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e2a1e]";

export const limeButton = cn(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill bg-[#bef264] font-bold text-[#10231a] transition-[background-color,transform] duration-200 hover:bg-[#d9f99d] active:scale-[0.98]",
  focusRing,
);

export const display = "font-display font-extrabold tracking-[-0.035em] text-balance";

/**
 * Fonte dos títulos (quando se chega por navegação interna) e barra de rolagem
 * da página no tom da mesa; a barra volta ao padrão do app ao sair daqui.
 */
export function useLandingChrome() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollbarColor;
    root.style.scrollbarColor = "#2f5a45 #091f15";
    return () => {
      root.style.scrollbarColor = previous;
    };
  }, []);

  useEffect(() => {
    if (document.querySelector(`link[href="${DISPLAY_FONT_CSS}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = DISPLAY_FONT_CSS;
    document.head.appendChild(link);
  }, []);
}

export function scrollToId(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const navLinks = [
  { id: "como-funciona", label: "Como funciona" },
  { id: "seguranca", label: "Segurança" },
  { id: "precos", label: "Preço" },
  { id: "duvidas", label: "Dúvidas" },
];

export function Logo() {
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-icon bg-[#bef264] text-[#10231a]">
        <Coins className="h-5 w-5" />
      </span>
      <span className="font-display text-xl font-extrabold tracking-[-0.03em] text-white">MeuGasto</span>
    </span>
  );
}

/**
 * `sections` diz o que os links de seção do menu fazem: na home as seções estão
 * na própria página e a rolagem é suave ("same-page"); nas páginas temáticas
 * elas estão na home, então o link vai para "/#seção" de verdade ("home").
 */
export function LandingNav({ sections = "same-page" }: { sections?: "same-page" | "home" }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const sectionClass = cn(
    "rounded-sm text-sm font-medium text-[#bdd0bb] transition-colors duration-200 hover:text-white",
    focusRing,
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,border-color] duration-300",
        scrolled ? "border-white/10 bg-[#0b2419]" : "border-transparent bg-[#0e2a1e]",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-4 sm:h-[4.5rem] sm:px-6 lg:px-10">
        <Link to="/" className={cn("rounded-icon", focusRing)} aria-label="MeuGasto, início">
          <Logo />
        </Link>

        <nav aria-label="Seções" className="hidden items-center gap-7 md:flex">
          {navLinks.map(({ id, label }) =>
            sections === "same-page" ? (
              <a key={id} href={`#${id}`} onClick={(event) => scrollToId(event, id)} className={sectionClass}>
                {label}
              </a>
            ) : (
              <Link key={id} to={`/#${id}`} className={sectionClass}>
                {label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            to="/login"
            className={cn(
              "rounded-pill px-3 py-2 text-sm font-semibold text-[#eef5ec] transition-colors duration-200 hover:bg-white/10",
              focusRing,
            )}
          >
            Entrar
          </Link>
          <Link to="/register" className={cn(limeButton, "px-4 py-2 text-sm")}>
            Teste grátis
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * Rodapé comum. A lista de páginas vem de PUBLIC_PAGES, então nenhuma página
 * temática fica órfã: a home e todas elas linkam todas as outras, e a página
 * atual aparece marcada com aria-current em vez de repetir um link para si.
 */
export function LandingFooter({ currentPath }: { currentPath?: string }) {
  const footerFocus =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bef264] focus-visible:ring-offset-2 focus-visible:ring-offset-[#091f15]";

  return (
    <footer className="bg-[#091f15] py-10 text-sm text-[#bdd0bb]">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10">
        <nav aria-label="Páginas sobre o MeuGasto" className="border-b border-white/10 pb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8fa68d]">
            Saiba mais sobre o MeuGasto
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {PUBLIC_PAGES.map((page) => (
              <li key={page.id}>
                <Link
                  to={page.path}
                  aria-current={page.path === currentPath ? "page" : undefined}
                  className={cn(
                    "rounded-sm underline-offset-4 transition-colors duration-200 hover:text-white hover:underline",
                    page.path === currentPath && "font-semibold text-white",
                    footerFocus,
                  )}
                >
                  {page.breadcrumb}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-6 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className={cn("rounded-icon", footerFocus)} aria-label="MeuGasto, início">
            <Logo />
          </Link>
          <p>
            © {new Date().getFullYear()} MeuGasto · Desenvolvido pela{" "}
            <a
              href={AZUOS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("rounded-sm font-semibold text-[#bef264] underline-offset-4 hover:underline", footerFocus)}
            >
              Azuos Dev
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
