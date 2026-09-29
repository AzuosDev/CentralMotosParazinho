---
version: 1
slug: "frontend-src-pages-landingpage-tsx"
primary_target: "frontend/src/pages/LandingPage.tsx"
related_targets: []
---

# Landing (/landing)

Scope: página pública de marketing do MeuGasto. Modo: Persuade.
Audiência: pessoa física e autônomos; ação: "Começar teste grátis" (15 dias, sem cartão). Secundário: Empresarial via e-mail/WhatsApp.
Prova: só o próprio produto (fragmentos fiéis ao app, valores rotulados como ilustrativos). Sem depoimentos nem números inventados.
Restrições: identidade do MeuGasto (verde-floresta + lima do painel de login, DM Sans no corpo); fonte de títulos compartilhada com a Azuos Dev; assinatura "Desenvolvido pela Azuos Dev".

## Direction contract

THESIS: A landing é a mesa verde-floresta do login em escala de página: as peças reais do app (saldo, cartão, fatura, conta, meta) são o conteúdo, e se reorganizam a cada argumento. Recusa o hero centralizado + grade de cards com ícone.

OWN-WORLD: campo #0e2a1e com lua de luz lima no canto; lima #bef264 como única cor de ação; peças em papel claro (#f6f8f3/branco, tinta #10231a) com sombra longa e suave; cartão de crédito em gradiente lima; faixas de fundo #0a0a0a (o chão do app) para respiro. Títulos Bricolage Grotesque 700–800, corpo DM Sans, números tabulares.

STORY: o visitante entende em uma tela que é um app de finanças que funciona sem conectar o banco, acredita porque vê a interface fazendo o trabalho (fatura certa, conta lembrada, meta andando), e começa o teste grátis.

FIRST VIEWPORT: esquerda (5/12): título em duas frases, subtítulo, CTA lima "Começar teste grátis" + "Já tenho conta", linha de garantias. Direita (7/12): a mesa com as peças em camadas, grande, sangrando levemente para a direita; rótulo "valores ilustrativos".

FORM: estrutura 7 de 7 na lista ranqueada ("Mesa verde-floresta"), seed 69b6d427. Interação-assinatura: palco fixo na seção de argumentos onde a peça do argumento ativo vem à frente e as demais recuam, dirigido pela rolagem; no mobile, cada argumento mostra sua peça em linha.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
