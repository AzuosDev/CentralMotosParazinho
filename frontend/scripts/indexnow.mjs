/*
 * Notifica o IndexNow (Bing, Yandex, Seznam, Naver) de que as páginas públicas
 * mudaram, em vez de esperar o rastreamento espontâneo.
 *
 * Rode DEPOIS do deploy: o buscador busca <SITE_URL>/<chave>.txt para conferir
 * que quem notificou controla o domínio, e esse arquivo só existe no ar depois
 * que o build publicado incluir ele.
 *
 * Precisa de Node 22.18+ ou 24+, que lê .ts direto — é assim que a chave e o
 * domínio vêm de site.config.ts, sem cópia.
 */
import { indexNowPingUrl, siteUrl, INDEXNOW_KEY } from "../site.config.ts";

const keyUrl = siteUrl(`/${INDEXNOW_KEY}.txt`);

async function main() {
  /*
   * Confere primeiro que a chave está publicada. O status não serve de teste:
   * o rewrite da SPA devolve o shell HTML com 200 para qualquer caminho que
   * não exista, então o que vale é o corpo bater com a chave.
   */
  const res = await fetch(keyUrl, { cache: "no-store" });
  const body = (await res.text()).trim();

  if (body !== INDEXNOW_KEY) {
    const motivo = body.includes("<!doctype html")
      ? "o servidor devolveu o HTML da SPA, ou seja, o arquivo não existe lá"
      : `o servidor devolveu ${JSON.stringify(body.slice(0, 40))}`;
    console.error(`Chave ainda não publicada em ${keyUrl}:`);
    console.error(`  ${motivo} (HTTP ${res.status}).`);
    console.error("Faça o deploy do build atual antes de notificar.");
    return 1;
  }

  console.log(`Chave conferida em ${keyUrl}`);

  const ping = await fetch(indexNowPingUrl(), { cache: "no-store" });

  // 200 = aceito; 202 = aceito, com a chave a ser validada depois.
  if (ping.status === 200 || ping.status === 202) {
    console.log(`IndexNow aceitou (HTTP ${ping.status}): ${siteUrl("/")}`);
    return 0;
  }

  console.error(`IndexNow recusou (HTTP ${ping.status}):`);
  console.error(await ping.text());
  return 1;
}

/*
 * exitCode em vez de process.exit(): com o exit abrupto, o socket keep-alive do
 * fetch ainda aberto derruba o libuv no Windows com um assert. Assim o Node
 * fecha sozinho quando o pool drena.
 */
process.exitCode = await main();
