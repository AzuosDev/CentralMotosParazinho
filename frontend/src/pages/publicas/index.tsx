/*
 * Registro das páginas públicas temáticas.
 *
 * Usado em dois lugares: aqui pelo PublicRoute, que é o que o React Router
 * monta em navegação no navegador, e por src/entry-prerender.tsx, que renderiza
 * cada uma para HTML estático no build. Os dois lados usam a mesma lista, para
 * que não exista página que exista numa rota e não na outra — há teste
 * conferindo isso contra PUBLIC_PAGES.
 */
import type { ComponentType } from "react";
import { useLocation } from "react-router-dom";

import { findPublicPage, type PublicPageId } from "../../content/public-pages";
import { ControleDeCartaoPage } from "./ControleDeCartaoPage";
import { ControleDeContasPage } from "./ControleDeContasPage";
import { ControleDeGastosPage } from "./ControleDeGastosPage";
import { ControleFinanceiroPessoalPage } from "./ControleFinanceiroPessoalPage";
import { ImportarExtratoOfxPage } from "./ImportarExtratoOfxPage";
import { MetasFinanceirasPage } from "./MetasFinanceirasPage";
import { SobreOMeuGastoPage } from "./SobreOMeuGastoPage";

export const PUBLIC_PAGE_COMPONENTS: Record<PublicPageId, ComponentType> = {
  "controle-financeiro-pessoal": ControleFinanceiroPessoalPage,
  "controle-de-gastos": ControleDeGastosPage,
  "controle-de-cartao": ControleDeCartaoPage,
  "controle-de-contas": ControleDeContasPage,
  "metas-financeiras": MetasFinanceirasPage,
  "importar-extrato-ofx": ImportarExtratoOfxPage,
  "sobre-o-meugasto": SobreOMeuGastoPage,
};

/**
 * Um componente para as sete rotas, resolvido pelo caminho atual. Assim o
 * App.tsx carrega um único chunk para toda a área pública temática em vez de
 * sete, e as rotas continuam sendo sete URLs independentes.
 */
export function PublicRoute() {
  const { pathname } = useLocation();
  const page = findPublicPage(pathname);

  // Só acontece se alguém registrar a rota no App.tsx sem registrar a página
  // aqui; o <Route path="*"> do App.tsx cuida de caminho desconhecido.
  if (!page) return null;

  const Pagina = PUBLIC_PAGE_COMPONENTS[page.id];
  return <Pagina />;
}
