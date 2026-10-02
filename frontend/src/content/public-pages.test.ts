import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PUBLIC_PAGES, PUBLIC_PAGE_PATHS, pageFileName, pageJsonLd } from "./public-pages";
import { SITE_URL, publicUrls, robotsTxt, sitemapXml, siteUrl } from "../../site.config";

/** Rotas que nunca podem ser tratadas como públicas/indexáveis. */
const ROTAS_PRIVADAS = [
  "/login",
  "/register",
  "/checkout",
  "/dashboard",
  "/expenses",
  "/transactions",
  "/carteiras",
  "/cartoes",
  "/contas",
  "/goals",
  "/configuracoes",
  "/faq",
  "/admin/suporte",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
];

function unico<T>(valores: T[]): boolean {
  return new Set(valores).size === valores.length;
}

describe("metadados das páginas públicas", () => {
  it("não repete caminho, title, description nem H1", () => {
    expect(unico(PUBLIC_PAGES.map((p) => p.path))).toBe(true);
    expect(unico(PUBLIC_PAGES.map((p) => p.title))).toBe(true);
    expect(unico(PUBLIC_PAGES.map((p) => p.description))).toBe(true);
    expect(unico(PUBLIC_PAGES.map((p) => p.h1))).toBe(true);
    expect(unico(PUBLIC_PAGES.map((p) => p.breadcrumb))).toBe(true);
  });

  it("usa caminho em minúsculas, com barra inicial e sem barra final", () => {
    for (const page of PUBLIC_PAGES) {
      expect(page.path).toMatch(/^\/[a-z0-9-]+$/);
    }
  });

  it("mantém title e description em tamanho razoável para o resultado de busca", () => {
    for (const page of PUBLIC_PAGES) {
      expect(page.title.length, page.path).toBeLessThanOrEqual(65);
      expect(page.title).toContain("MeuGasto");
      expect(page.description.length, page.path).toBeGreaterThanOrEqual(70);
      expect(page.description.length, page.path).toBeLessThanOrEqual(185);
    }
  });

  it("declara lastmod como data ISO", () => {
    for (const page of PUBLIC_PAGES) {
      expect(page.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("só aponta relacionadas que existem, e nunca para si mesma", () => {
    const ids = new Set(PUBLIC_PAGES.map((p) => p.id));
    for (const page of PUBLIC_PAGES) {
      expect(page.relacionadas.length, page.path).toBeGreaterThan(0);
      for (const id of page.relacionadas) {
        expect(ids.has(id), `${page.path} -> ${id}`).toBe(true);
        expect(id).not.toBe(page.id);
      }
    }
  });

  it("não deixa página órfã: toda página é apontada por outra", () => {
    const apontadas = new Set(PUBLIC_PAGES.flatMap((p) => p.relacionadas));
    for (const page of PUBLIC_PAGES) {
      expect(apontadas.has(page.id), `${page.path} não é apontada por nenhuma outra`).toBe(true);
    }
  });
});

describe("sitemap e robots", () => {
  it("lista a home e todas as páginas temáticas, e nada além disso", () => {
    expect(publicUrls()).toEqual([siteUrl("/"), ...PUBLIC_PAGE_PATHS.map((p) => siteUrl(p))]);
  });

  it("não inclui rota privada, /landing nem arquivo .html", () => {
    const xml = sitemapXml();
    for (const rota of [...ROTAS_PRIVADAS, "/landing"]) {
      expect(xml, rota).not.toContain(`<loc>${siteUrl(rota)}</loc>`);
    }
    expect(xml).not.toContain(".html");
  });

  it("gera um <loc> por URL pública, com o domínio configurado", () => {
    const xml = sitemapXml();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(publicUrls());
    for (const loc of locs) expect(loc.startsWith(SITE_URL)).toBe(true);
  });

  it("mantém o robots.txt liberando tudo e apontando o sitemap", () => {
    const txt = robotsTxt();
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain(`Sitemap: ${siteUrl("/sitemap.xml")}`);
    expect(txt).not.toContain("Disallow");
  });
});

describe("rewrites do vercel.json", () => {
  const config = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"),
  ) as { rewrites: { source: string; destination: string }[] };

  it("entrega cada página temática como o seu próprio HTML", () => {
    for (const page of PUBLIC_PAGES) {
      expect(config.rewrites, page.path).toContainEqual({
        source: page.path,
        destination: `/${pageFileName(page)}`,
      });
    }
  });

  it("deixa o catch-all do app.html como última regra", () => {
    const ultima = config.rewrites[config.rewrites.length - 1];
    expect(ultima).toEqual({ source: "/(.*)", destination: "/app.html" });
  });
});

describe("JSON-LD das páginas públicas", () => {
  type No = { "@type": string | string[]; [key: string]: unknown };
  const graphDe = (page: (typeof PUBLIC_PAGES)[number]) =>
    (pageJsonLd(page, siteUrl) as { "@graph": No[] })["@graph"];

  const temTipo = (grafo: No[], tipo: string) =>
    grafo.find((no) => (Array.isArray(no["@type"]) ? no["@type"].includes(tipo) : no["@type"] === tipo));

  it("descreve a página, a trilha e as entidades do site", () => {
    for (const page of PUBLIC_PAGES) {
      const grafo = graphDe(page);
      expect(temTipo(grafo, page.schemaType ?? "WebPage"), page.path).toBeDefined();
      expect(temTipo(grafo, "BreadcrumbList"), page.path).toBeDefined();
      expect(temTipo(grafo, "WebSite"), page.path).toBeDefined();
      expect(temTipo(grafo, "Organization"), page.path).toBeDefined();
      expect(temTipo(grafo, "SoftwareApplication"), page.path).toBeDefined();
    }
  });

  it("usa o canonical da própria rota e @id resolvível", () => {
    for (const page of PUBLIC_PAGES) {
      const grafo = graphDe(page);
      const webpage = temTipo(grafo, page.schemaType ?? "WebPage")!;
      expect(webpage.url).toBe(siteUrl(page.path));
      expect(webpage["@id"]).toBe(`${siteUrl(page.path)}#webpage`);

      const ids = new Set(grafo.map((no) => no["@id"]));
      expect(ids.has((webpage.isPartOf as { "@id": string })["@id"])).toBe(true);
      expect(ids.has((webpage.about as { "@id": string })["@id"])).toBe(true);
      expect(ids.has((webpage.breadcrumb as { "@id": string })["@id"])).toBe(true);
    }
  });

  it("declara um breadcrumb igual ao visível: Início > página", () => {
    for (const page of PUBLIC_PAGES) {
      const trilha = temTipo(graphDe(page), "BreadcrumbList")! as unknown as {
        itemListElement: { position: number; name: string; item: string }[];
      };
      expect(trilha.itemListElement).toEqual([
        { "@type": "ListItem", position: 1, name: "Início", item: siteUrl("/") },
        { "@type": "ListItem", position: 2, name: page.breadcrumb, item: siteUrl(page.path) },
      ]);
    }
  });

  it("não declara nota, avaliação, preço nem contagem de usuários", () => {
    for (const page of PUBLIC_PAGES) {
      const serializado = JSON.stringify(pageJsonLd(page, siteUrl));
      for (const proibido of [
        "aggregateRating",
        "ratingValue",
        "reviewCount",
        "userInteractionCount",
        "review",
        "offers",
        "price",
        "award",
      ]) {
        expect(serializado, `${page.path} declara ${proibido}`).not.toContain(proibido);
      }
    }
  });

  it("aponta a Azuos Dev como publisher do site e do aplicativo", () => {
    const grafo = graphDe(PUBLIC_PAGES[0]);
    const azuos = temTipo(grafo, "Organization")!;
    expect(azuos.name).toBe("Azuos Dev");
    expect(temTipo(grafo, "WebSite")!.publisher).toEqual({ "@id": azuos["@id"] });
    expect(temTipo(grafo, "SoftwareApplication")!.publisher).toEqual({ "@id": azuos["@id"] });
  });
});
