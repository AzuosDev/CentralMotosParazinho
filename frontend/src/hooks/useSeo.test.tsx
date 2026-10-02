/*
 * O prerender cobre o HTML que o robô recebe; este teste cobre o outro caminho,
 * o da navegação interna, em que o <head> é alterado pelo useSeo no navegador —
 * e principalmente que ele é desfeito na saída, para não deixar o title de uma
 * página temática valendo depois que o usuário sai dela.
 */
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { PUBLIC_PAGE_COMPONENTS } from "../pages/publicas";
import { PUBLIC_PAGES, publicPage } from "../content/public-pages";
import { siteUrl } from "../../site.config";

const TITLE_ORIGINAL = "MeuGasto | Controle Financeiro Pessoal e de Gastos";
const CANONICAL_ORIGINAL = siteUrl("/");

function montarHead() {
  document.head.innerHTML = `
    <title>${TITLE_ORIGINAL}</title>
    <meta name="description" content="descrição da home" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${CANONICAL_ORIGINAL}" />
    <meta property="og:url" content="${CANONICAL_ORIGINAL}" />
    <meta property="og:title" content="${TITLE_ORIGINAL}" />
  `;
  document.title = TITLE_ORIGINAL;
}

const meta = (selector: string) =>
  document.head.querySelector<HTMLMetaElement>(selector)?.getAttribute("content");

function renderizar(id: (typeof PUBLIC_PAGES)[number]["id"]) {
  const page = publicPage(id);
  const Pagina = PUBLIC_PAGE_COMPONENTS[id];
  return render(
    <MemoryRouter initialEntries={[page.path]}>
      <Pagina />
    </MemoryRouter>,
  );
}

describe("useSeo em navegação interna", () => {
  beforeEach(montarHead);

  it("aplica title, description e canonical da rota", () => {
    const page = publicPage("controle-de-gastos");
    renderizar("controle-de-gastos");

    expect(document.title).toBe(page.title);
    expect(meta('meta[name="description"]')).toBe(page.description);
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      siteUrl(page.path),
    );
    expect(meta('meta[property="og:url"]')).toBe(siteUrl(page.path));
    expect(meta('meta[property="og:title"]')).toBe(page.title);
    expect(meta('meta[name="robots"]')).toBe("index, follow");
  });

  it("injeta um único JSON-LD da rota", () => {
    renderizar("metas-financeiras");

    const scripts = document.head.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const dados = JSON.parse(scripts[0].textContent!) as { "@graph": { "@id": string }[] };
    expect(dados["@graph"].some((no) => no["@id"] === `${siteUrl("/metas-financeiras")}#webpage`)).toBe(true);
  });

  it("devolve o <head> ao estado anterior ao sair da página", () => {
    const { unmount } = renderizar("controle-de-cartao");
    unmount();

    expect(document.title).toBe(TITLE_ORIGINAL);
    expect(meta('meta[name="description"]')).toBe("descrição da home");
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      CANONICAL_ORIGINAL,
    );
    expect(meta('meta[property="og:title"]')).toBe(TITLE_ORIGINAL);
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0);
  });

  it("não deixa meta da página anterior ao trocar de rota", () => {
    const primeira = renderizar("controle-de-contas");
    primeira.unmount();
    renderizar("sobre-o-meugasto");

    const alvo = publicPage("sobre-o-meugasto");
    expect(document.title).toBe(alvo.title);
    expect(meta('meta[name="description"]')).toBe(alvo.description);
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
  });

  it("cria as metas que faltam no documento, e as remove ao sair", () => {
    document.head.querySelector('meta[name="twitter:title"]')?.remove();
    const { unmount } = renderizar("importar-extrato-ofx");

    expect(meta('meta[name="twitter:title"]')).toBe(publicPage("importar-extrato-ofx").title);
    unmount();
    expect(document.head.querySelector('meta[name="twitter:title"]')).toBeNull();
  });
});
