/*
 * Confere o HTML que o build realmente entrega para cada rota pública: é a
 * mesma função que o plugin meugasto-seo chama no build (renderPublicPage),
 * então o que passa aqui é o que vai para o disco e para o robô de busca.
 */
import { describe, expect, it } from "vitest";

import { renderPublicPage } from "../../entry-prerender";
import { PUBLIC_PAGES, publicPage } from "../../content/public-pages";
import { PUBLIC_PAGE_COMPONENTS } from ".";
import { siteUrl } from "../../../site.config";

const renderizadas = PUBLIC_PAGES.map((page) => ({ page, html: renderPublicPage(page.path) }));

describe("páginas públicas renderizadas", () => {
  it("tem um componente registrado para cada página", () => {
    expect(Object.keys(PUBLIC_PAGE_COMPONENTS).sort()).toEqual(PUBLIC_PAGES.map((p) => p.id).sort());
  });

  it("recusa rota desconhecida em vez de gerar página vazia", () => {
    expect(() => renderPublicPage("/nao-existe")).toThrow(/rota pública desconhecida/);
  });

  it.each(renderizadas)("$page.path tem exatamente um H1, com o texto esperado", ({ page, html }) => {
    const h1s = [...html.markup.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
    expect(h1s).toHaveLength(1);
    expect(h1s[0][1]).toContain(page.h1);
  });

  it.each(renderizadas)("$page.path não usa H2/H3 fora de ordem", ({ html }) => {
    // Não pode existir H3 antes do primeiro H2, nem H2 antes do H1.
    const niveis = [...html.markup.matchAll(/<h([123])[^>]*>/g)].map((m) => Number(m[1]));
    expect(niveis[0]).toBe(1);
    for (let i = 1; i < niveis.length; i += 1) {
      expect(niveis[i] - niveis[i - 1], `salto de h${niveis[i - 1]} para h${niveis[i]}`).toBeLessThanOrEqual(1);
    }
  });

  it.each(renderizadas)("$page.path leva title, description e canonical próprios", ({ page, html }) => {
    expect(html.head).toContain(`<title>${page.title}</title>`);
    expect(html.head).toContain(`content="${page.description}"`);
    expect(html.head).toContain(`<link rel="canonical" href="${siteUrl(page.path)}" />`);
    expect(html.head).toContain(`content="${siteUrl(page.path)}"`); // og:url
  });

  it.each(renderizadas)("$page.path pede indexação, nunca noindex", ({ html }) => {
    expect(html.head).toContain('content="index, follow"');
    expect(html.head).not.toContain("noindex");
  });

  it.each(renderizadas)("$page.path leva JSON-LD válido e sem fechar a tag script", ({ page, html }) => {
    const corpo = html.jsonLd.replace(/^<script type="application\/ld\+json">/, "").replace(/<\/script>$/, "");
    expect(corpo).not.toContain("</script");
    const dados = JSON.parse(corpo.replaceAll("\\u003c", "<")) as { "@graph": unknown[] };
    expect(dados["@graph"].length).toBeGreaterThan(0);
    expect(corpo).toContain(siteUrl(page.path));
  });

  it.each(renderizadas)("$page.path mostra o breadcrumb visível com link para a home", ({ page, html }) => {
    expect(html.markup).toContain('aria-label="Trilha de navegação"');
    expect(html.markup).toContain(">Início</a>");
    expect(html.markup).toContain(`>${page.breadcrumb}</span>`);
  });

  it.each(renderizadas)("$page.path linka todas as suas páginas relacionadas", ({ page, html }) => {
    for (const id of page.relacionadas) {
      expect(html.markup, `${page.path} -> ${id}`).toContain(`href="${publicPage(id).path}"`);
    }
  });

  it.each(renderizadas)("$page.path tem CTA de teste grátis e volta para a home", ({ html }) => {
    expect(html.markup).toContain('href="/register"');
    expect(html.markup).toContain('href="/"');
  });

  it.each(renderizadas)("$page.path tem cabeçalho, main e rodapé semânticos", ({ html }) => {
    for (const tag of ["<header", "<nav", "<main>", "<article", "<section", "<footer"]) {
      expect(html.markup, tag).toContain(tag);
    }
  });

  /*
   * O produto não se conecta ao banco, e isso tem de continuar verdadeiro no
   * texto. A checagem é por afirmação, não por palavra: "não usa open finance"
   * é justamente a frase certa, então procurar "open finance" solto acusaria o
   * contrário do que se quer.
   */
  it.each(renderizadas)("$page.path não afirma conexão direta com o banco", ({ html }) => {
    const texto = html.markup.replace(/<[^>]*>/g, " ").toLowerCase();
    for (const afirmacao of [
      /(?<!não )(?:usa|usamos|use) open finance/,
      /conecte (?:sua|a sua) conta/,
      /sincroniz\w+ com (?:o|seu) banco/,
      /acesso (?:à|a) sua conta bancária\b(?![^.]*\bnão\b)/,
    ]) {
      expect(texto, String(afirmacao)).not.toMatch(afirmacao);
    }
  });

  it("não repete o H1 da home em nenhuma página temática", () => {
    for (const { html } of renderizadas) {
      expect(html.markup).not.toContain("e sua vida financeira em um só lugar");
    }
  });

  it("aponta a Azuos Dev no rodapé de todas elas", () => {
    for (const { html } of renderizadas) {
      expect(html.markup).toContain("Azuos Dev");
      expect(html.markup).toContain("https://azuos-dev.vercel.app/");
    }
  });
});
