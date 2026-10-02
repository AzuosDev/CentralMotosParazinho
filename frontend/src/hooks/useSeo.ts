/*
 * Metadados de <head> por rota, para navegação interna da SPA.
 *
 * Quem chega direto na URL já recebe o <head> certo: cada página pública tem
 * HTML pré-renderizado com title, description, canonical, Open Graph e JSON-LD
 * próprios (ver src/entry-prerender.tsx e o plugin meugasto-seo em
 * vite.config.ts) — e é esse HTML que o robô de busca lê. Este hook existe para
 * o outro caso, o do usuário que navega de uma página para outra sem recarregar:
 * o documento é o mesmo e o <head> precisa acompanhar.
 *
 * Tudo que ele escreve é desfeito na saída, restaurando o valor anterior. Assim
 * sair de uma página temática para a home ou para o app não deixa o title de
 * uma página para trás.
 */
import { useEffect } from "react";

import { pageJsonLd, type PublicPage } from "../content/public-pages";
import { siteUrl } from "../../site.config";

const JSON_LD_ID = "seo-rota";

type Restore = () => void;

/** Lê o conteúdo atual da meta e devolve a função que o repõe. */
function setMeta(selector: string, attribute: "name" | "property", key: string, value: string): Restore {
  const element = document.head.querySelector<HTMLMetaElement>(selector);

  // A meta não existe no index.html: cria agora e remove na saída.
  if (!element) {
    const created = document.createElement("meta");
    created.setAttribute(attribute, key);
    created.setAttribute("content", value);
    document.head.appendChild(created);
    return () => created.remove();
  }

  const previous = element.getAttribute("content");
  element.setAttribute("content", value);
  return () => {
    if (previous === null) element.removeAttribute("content");
    else element.setAttribute("content", previous);
  };
}

function setCanonical(href: string): Restore {
  const element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!element) {
    const created = document.createElement("link");
    created.rel = "canonical";
    created.href = href;
    document.head.appendChild(created);
    return () => created.remove();
  }

  const previous = element.href;
  element.href = href;
  return () => {
    element.href = previous;
  };
}

function setJsonLd(data: unknown): Restore {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = JSON_LD_ID;
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
  return () => script.remove();
}

export function useSeo(page: PublicPage) {
  useEffect(() => {
    const canonical = siteUrl(page.path);
    const previousTitle = document.title;
    document.title = page.title;

    const restores: Restore[] = [
      setCanonical(canonical),
      setMeta('meta[name="description"]', "name", "description", page.description),
      setMeta('meta[name="robots"]', "name", "robots", "index, follow"),
      setMeta('meta[property="og:url"]', "property", "og:url", canonical),
      setMeta('meta[property="og:title"]', "property", "og:title", page.title),
      setMeta('meta[property="og:description"]', "property", "og:description", page.description),
      setMeta('meta[name="twitter:title"]', "name", "twitter:title", page.title),
      setMeta('meta[name="twitter:description"]', "name", "twitter:description", page.description),
      setJsonLd(pageJsonLd(page, siteUrl)),
    ];

    return () => {
      document.title = previousTitle;
      // Na ordem inversa: a última alteração é a primeira a ser desfeita.
      for (const restore of restores.reverse()) restore();
    };
  }, [page]);
}
