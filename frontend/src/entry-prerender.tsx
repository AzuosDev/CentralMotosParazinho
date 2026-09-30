/*
 * Entrada usada só no build: renderiza a landing para HTML estático, que o
 * plugin meugasto-seo (vite.config.ts) injeta dentro de <div id="root"> no
 * index.html. Nada aqui vai para o bundle do navegador.
 *
 * É renderToStaticMarkup, e não renderToString, porque o app monta com
 * createRoot e não com hydrateRoot (ver src/main.tsx): o React descarta esta
 * marcação e renderiza do zero. Ela existe para o robô que não executa JS e
 * para o primeiro paint. Se um dia o app passar a hidratar, troque para
 * renderToString — senão a hidratação acusa mismatch.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";

import { LandingPage } from "./pages/LandingPage";

/*
 * Só a LandingPage, sem os providers de main.tsx: ela não consome nenhum
 * contexto (tema, auth, query) e todo acesso ao DOM dela está dentro de
 * useEffect, que não roda no servidor. O StaticRouter existe só porque os
 * <Link> do cabeçalho e dos CTAs precisam de um Router por perto.
 */
export function render(): string {
  return renderToStaticMarkup(
    <StaticRouter location="/">
      <LandingPage />
    </StaticRouter>,
  );
}
