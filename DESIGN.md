---
name: MeuGasto
description: Finanças pessoais sem conectar o banco. App escuro com acento lima; marca na mesa verde-floresta.
colors:
  bg-base: "#0a0a0a"
  bg-card: "#141414"
  bg-muted: "#1c1c1c"
  bg-overlay: "#232323"
  text-primary: "#ffffff"
  text-secondary: "#9ca3af"
  text-muted: "#80868f"
  border-default: "#2a2a2a"
  border-strong: "#3a3a3a"
  accent-lime: "#a3e635"
  accent-orange: "#f97316"
  color-income: "#22c55e"
  color-expense: "#ef4444"
  color-pending: "#eab308"
  forest: "#0e2a1e"
  forest-deep: "#091f15"
  forest-nav: "#0b2419"
  forest-raised: "#163a2a"
  brand-lime: "#bef264"
  brand-lime-hover: "#d9f99d"
  forest-text: "#eef5ec"
  forest-ink-soft: "#bdd0bb"
  floor-ink: "#a9b8a6"
  caption-green: "#8fa68d"
  floor-rule: "#1f2b24"
  forest-ring: "#2f4a3c"
  paper: "#f6f8f3"
  paper-white: "#ffffff"
  paper-ink: "#10231a"
  paper-ink-body: "#34473b"
  paper-ink-secondary: "#4b5f52"
  paper-rule: "#dfe7da"
  paper-track: "#e5ecdf"
  paper-lime-tint: "#ecfccb"
  paper-lime-ink: "#3f6212"
typography:
  brand-display:
    fontFamily: "Bricolage Grotesque, DM Sans, sans-serif"
    fontSize: "clamp(2.2rem, 5vw, 4.1rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.035em"
  brand-headline:
    fontFamily: "Bricolage Grotesque, DM Sans, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  brand-figure:
    fontFamily: "Bricolage Grotesque, DM Sans, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
  app-title:
    fontFamily: "Syne, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  auth-title:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  body-sm:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  icon: "12px"
  card: "16px"
  pill: "9999px"
  brand-paper: "20px"
  brand-plan: "24px"
  brand-panel: "28px"
spacing:
  card-sm: "16px"
  card-md: "20px"
  card-lg: "24px"
  gutter-mobile: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "40px"
  section: "96px"
  section-lg: "128px"
components:
  button-primary:
    backgroundColor: "{colors.accent-lime}"
    textColor: "#000000"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  input:
    backgroundColor: "{colors.bg-muted}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.icon}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
    padding: "20px"
  nav-item:
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.icon}"
    padding: "12px 16px"
  nav-item-active:
    backgroundColor: "{colors.bg-muted}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.icon}"
    padding: "12px 16px"
  brand-button-primary:
    backgroundColor: "{colors.brand-lime}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
  brand-button-primary-hover:
    backgroundColor: "{colors.brand-lime-hover}"
    textColor: "{colors.paper-ink}"
  brand-button-ghost:
    textColor: "{colors.forest-text}"
    rounded: "{rounded.pill}"
    padding: "14px 24px"
  brand-button-on-paper:
    backgroundColor: "{colors.paper-ink}"
    textColor: "{colors.brand-lime}"
    rounded: "{rounded.pill}"
    padding: "16px 28px"
  brand-paper-piece:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.brand-paper}"
    padding: "24px"
  brand-plan-dark:
    backgroundColor: "{colors.forest-raised}"
    textColor: "{colors.forest-text}"
    rounded: "{rounded.brand-plan}"
    padding: "40px"
---

# Design System: MeuGasto

## Overview

**Creative North Star: "A mesa verde-floresta"**

O MeuGasto tem duas camadas visuais, e cada uma governa um território próprio. A **camada do app** (Operate: dashboard, carteiras, cartões, contas, metas, insights, configurações) é um sistema de tokens por papel em `frontend/src/styles.css` + `tailwind.config.ts`: escuro por padrão (#0a0a0a), com tema claro espelhado sob `html.light`, superfícies que sobem em degraus tonais e um único acento lima. É denso, calmo e funcional; o número que o usuário vê é o protagonista.

A **camada de marca** (a landing em `/landing` e o painel `AuthShowcase` das telas de autenticação) é a mesa verde-floresta: um campo #0e2a1e iluminado por uma "lua" de luz lima no canto, sobre o qual peças do próprio app, impressas em papel claro com tinta verde-escura e sombras longas e macias, se arrumam como objetos sobre uma mesa. Essa camada é independente de tema: é idêntica no claro e no escuro, por isso suas cores vivem como valores fixos nos próprios componentes, não nos tokens de tema. As faixas #0a0a0a da landing são "o chão do app": o mesmo fundo do produto, usado como respiro entre os trechos de mesa.

As duas camadas se ligam pelo lima, pela DM Sans no corpo e pelas peças: a marca não inventa ilustrações, ela mostra fragmentos fiéis da interface (saldo, cartão, fatura, contas, meta) rotulados como "Valores ilustrativos". A camada de marca recusa o hero centralizado seguido de grade de cards com ícone; a prova é o produto em cena.

**Key Characteristics:**
- Dois territórios: tokens de tema no app; valores fixos, independentes de tema, na marca.
- Dois limas com papéis distintos: #a3e635 (app, com papéis fill/ink/line) e #bef264 (marca, única cor de ação sobre o verde-floresta).
- Profundidade no app por degraus tonais; na marca, por papel com sombra longa e macia.
- Bricolage Grotesque 700–800 só na landing; DM Sans auto-hospedada no resto.
- Números sempre tabulares.
- Movimento com uma curva só, `cubic-bezier(0.16, 1, 0.3, 1)`, e `prefers-reduced-motion` respeitado.

## Colors

Paleta de acento único em cada camada: neutros quase pretos com lima no app; verde-floresta, papel e lima claro na marca.

### Primary
- **Lima do app** (accent-lime): preenchimento de ação no app (botão principal com texto preto, item de navegação ativo no ícone, foco de campo). No tema escuro os três papéis (`--accent-lime`, `-ink`, `-line`) têm o mesmo valor; no claro, o preenchimento vira lime-500 (#84cc16), o texto lime-700 (#4d7c0f) e o traço lime-600 (#65a30d), porque #a3e635 sobre branco dá 1,4:1.
- **Lima de marca** (brand-lime): a única cor de ação sobre o verde-floresta: CTA "Começar teste grátis", toggle Mensal/Anual, marcadores de check, anel de foco, segunda frase de título, logo. Hover clareia para brand-lime-hover.

### Secondary
- **Semânticas do app** (color-income, color-expense, color-pending): entrada, saída, pendente. Só significam dinheiro; no tema claro escurecem para green-700 (#15803d), red-600 (#dc2626), yellow-700 (#a16207). accent-orange é acento secundário do app com o mesmo esquema fill/ink.

### Neutral
- **Chão do app** (bg-base): fundo da página no app e das faixas de respiro da landing.
- **Degraus do app** (bg-card, bg-muted, bg-overlay): card, campo/chip/trilho, hover/seção secundária, cada um um degrau acima.
- **Tintas do app** (text-primary, text-secondary, text-muted): título/valor, apoio, legenda (text-muted tem 5,0:1 sobre o card).
- **Bordas do app** (border-default, border-strong).
- **Verde-floresta** (forest): o campo da mesa, fundo da landing, do painel de autenticação, da seção de preço e do fechamento.
- **Floresta profunda** (forest-deep): rodapé, trilho do toggle, trilho da barra de rolagem da landing. **forest-nav** é o fundo da barra de navegação depois de rolar.
- **Floresta elevada** (forest-raised): peças escuras sobre a mesa (pílula de aviso, plano Empresarial).
- **Tintas sobre o verde** (forest-text, forest-ink-soft, floor-ink, caption-green): texto principal, parágrafos sobre floresta, parágrafos sobre o chão #0a0a0a, e legendas/segunda frase apagada ("Valores ilustrativos.", "Mais tempo pra decidir."). Todas têm matiz verde; nenhum cinza neutro aparece na marca.
- **Linhas sobre o verde** (floor-rule, forest-ring): divisórias de lista no chão escuro e anel dos botões circulares.
- **Papel** (paper, paper-white): as peças claras. **Tinta de papel** (paper-ink, paper-ink-body, paper-ink-secondary): valor, linha de lista, rótulo. **Régua e trilho de papel** (paper-rule, paper-track). **Lima sobre papel** (paper-lime-tint fundo, paper-lime-ink texto) para chips e ícones positivos dentro das peças.

### Named Rules
**The Two Limes Rule.** #a3e635 pertence ao app e passa por tokens com papéis fill/ink/line; #bef264 pertence à mesa verde-floresta e nunca entra em tela do app. Não misture os dois na mesma superfície.

**The Role Token Rule.** No app, cor só por token (`bg-bg-card`, `text-accent-lime`, `border-accent-lime`), nunca hex solto: `text-*` resolve para a versão ink, `border/ring/stroke` para a versão line. Valores fixos só são legítimos na camada de marca, que é independente de tema.

**The Dark-Stays-Put Rule.** Mudança no tema claro fica sob `html.light` (ou a variante `light:`) e deixa o escuro idêntico ao pixel.

## Typography

**Display Font:** Bricolage Grotesque (com DM Sans, sans-serif), variável 600–800, só na landing
**Body Font:** DM Sans (com sans-serif), auto-hospedada em `public/fonts/`
**App heading stack:** `fontFamily.sans` = Syne, sans-serif (configurada, nunca carregada; renderiza a sans padrão do navegador)

**Character:** Na marca, uma grotesca de títulos pesada e apertada, compartilhada com a Azuos Dev, contra uma DM Sans aberta e legível. No app, DM Sans carrega quase tudo e os números mandam.

### Hierarchy
- **Brand display** (800, 2.2rem → 4.1rem, 0.98–1.02): títulos da landing, sempre em duas frases curtas, a segunda em bloco próprio, em brand-lime ou caption-green. `text-wrap: balance`.
- **Brand headline** (700, 1.5rem → 1.875rem, -0.025em): subtítulos das seções da landing ("Importe o extrato.").
- **Brand figure** (800, tabular, -0.03em a -0.04em): valores nas peças e no preço (R$ 4.182,50, R$ 29,90). A unidade ("/mês") cai para DM Sans 500 com tracking normal.
- **App title** (700, 1.875rem, tracking-tight): título de página (`PageHeader`) e headings base, pela pilha `font-sans`.
- **Auth title** (DM Sans 700, 1.875rem, -0.02em): títulos das telas de autenticação e dos slides do `AuthShowcase`, que não carregam a Bricolage.
- **Body** (400, 1rem–1.125rem, 1.625): parágrafos, limite de 34–36rem na landing (`max-w-[36rem]`), `text-wrap: pretty`.
- **Body small** (500–600, 0.875rem): botões, navegação, linhas de lista do app.
- **Label** (500, 0.75rem): rótulo de campo (`text-text-secondary`), legendas.

### Named Rules
**The Display Quarantine Rule.** A Bricolage Grotesque só é baixada na rota `/landing` (script inline do `index.html` + `useLandingChrome`). Nenhuma tela do app nem de autenticação depende dela; títulos fora da landing usam DM Sans.

**The Tabular Rule.** Todo valor monetário, porcentagem e dígito de cartão usa `tabular-nums`.

## Layout

App: `AppLayout` com barra lateral (itens `rounded-xl`, recolhível para só ícones com tooltip) e conteúdo em cards; padding interno de card 16/20/24px, cabeçalho de página com `mb-8`. Tema claro espelha a mesma estrutura.

Landing: contêiner `max-w-7xl` (1280px) com gutters 16/24/40px (mobile/sm/lg) e grade de 12 colunas no desktop. O hero e os argumentos ocupam 5 colunas à esquerda; a mesa ocupa 7 à direita, fixa (`sticky`, altura `100svh - 4.5rem`), sangrando ~7% para a direita. Cada argumento tem `min-h-[78vh]` e o que cruza o meio da tela decide o arranjo da mesa. Seções seguintes alternam fundo floresta e chão #0a0a0a, com `py-24` / `sm:py-32` e composições assimétricas 5/7 ou 4/8, nunca centralizadas. Abaixo de `lg`, a mesa aparece uma vez sob o hero (sangrando à direita, `pt-10`) e cada argumento mostra sua peça em linha.

Breakpoints padrão do Tailwind: sm 640, md 768, lg 1024, xl 1280.

## Elevation & Depth

Híbrido, e dividido por camada. **O app é plano por degraus tonais:** base → card → muted → overlay, com bordas `border-bg-muted`/`border-default`; sombra só no que flutua (tooltip, menu, modal: `shadow-xl`/`shadow-2xl`). **A marca é papel sobre mesa:** peças claras com sombras longas, macias e de espalhamento negativo, que caem para baixo como luz de cima; a luz ambiente vem de um gradiente radial lima no canto (a "lua"), e um véu escuro na base do painel de autenticação.

### Shadow Vocabulary
- **Peça da mesa** (`box-shadow: 0 1.6em 3em -1em rgba(0,0,0,0.55)`): peças em escala `em` dentro da mesa.
- **Papel no chão** (`box-shadow: 0 1.75rem 3.5rem -1.25rem rgba(0,0,0,0.75)`): peças de papel sobre #0a0a0a, mais escura porque o chão é mais escuro.
- **Plano** (`box-shadow: 0 2rem 4rem -1.5rem rgba(0,0,0,0.55)`): card do plano Básico.
- **Flutuante do app** (Tailwind `shadow-xl`): menus e tooltips do app.

### Named Rules
**The Paper Casts, Screens Don't Rule.** Sombra grande é privilégio do papel na camada de marca. No app, profundidade vem do degrau tonal; sombra só em elemento flutuante.

**The Moon Rule.** A luz da marca é um único gradiente radial lima (alfa 0,12–0,16) num canto, fora da área de leitura. Um por seção de floresta, nunca atrás de texto.

## Shapes

Tudo arredondado, nada de canto vivo. App: pílula para botões e chips, 12px (`rounded-icon`/`rounded-xl`) para campos, itens de navegação e tiles de ícone, 16px (`rounded-2xl`, igual a `rounded-card`) para cards. Marca: pílula para todo botão e toggle, peças da mesa em `1.1em` (escalam com a mesa), papel solto 20px, cards de plano 24px, painel do `AuthShowcase` 28px. O cartão de crédito mantém a proporção real (1.586) com canto de 0.9em. Peças de papel na landing pousam levemente giradas (±1–2°); na mesa, a rotação faz parte de cada pose.

## Components

### Buttons
Pílula e peso de verdade, nas duas camadas.
- **Shape:** pílula (9999px).
- **Primary do app:** accent-lime com texto preto, 14px semibold/bold, `hover:brightness-110`, `disabled:opacity-60` (`SubmitButton`).
- **Primary de marca:** brand-lime com tinta paper-ink, bold, hover para brand-lime-hover, `active:scale-[0.98]`, 200ms; foco com anel brand-lime e offset na cor do fundo.
- **Ghost de marca:** texto forest-text com anel `white/20`, hover `white/10`.
- **Sobre papel:** fundo paper-ink com texto brand-lime (plano Básico), hover forest-raised.

### Chips
- **Style (peças):** pílula pequena em paper-lime-tint / paper-lime-ink (positivo, "cobrada no cartão") ou #fef3c7 / #854d0e (vencimento próximo).
- **Toggle de marca:** trilho forest-deep com anel `white/10`, indicador brand-lime que desliza 300ms na curva da casa.

### Cards / Containers
- **Corner Style:** 16px no app; 20–24px no papel da marca.
- **Background:** bg-card no app (às vezes com borda bg-muted); paper/paper-white ou forest-raised na marca.
- **Shadow Strategy:** ver Elevation & Depth.
- **Internal Padding:** 16–24px no app; 24–40px nos planos.

### Inputs / Fields
- **Style:** fundo bg-muted, sem borda visível (borda transparente), 12px, ícone em text-secondary, rótulo 12px acima.
- **Focus:** borda accent-lime (line) + anel `accent-lime/20`.
- **Error:** borda accent-red e mensagem 12px em accent-red.

### Navigation
- **App:** barra lateral com itens 14px medium em text-secondary; hover bg-overlay; ativo bg-muted + text-primary com ícone em accent-lime.
- **Landing:** barra fixa de 64/72px, floresta transparente que vira forest-nav com régua `white/10` após 12px de rolagem; links em forest-ink-soft → branco; "Entrar" ghost e "Teste grátis" lima.

### A Mesa (signature)
Palco `aspect-[7/6]` com `container-type: inline-size`; o tamanho de fonte é `2.5cqw` e todas as peças medem em `em`, então escalam juntas. Cada peça tem uma pose por arranjo (`LAYOUTS`: x/y em cqw, rotação, escala, z); a peça em foco vem à frente em escala 1.2–1.7 e as outras recuam para opacidade 0,32 com `blur(1.5px) saturate(0.5)`. Transição de transform/opacity/filter em 900ms `cubic-bezier(0.16,1,0.3,1)`; na chegada as peças pousam de 6cqw abaixo com atraso escalonado de 70ms; `motion-reduce:transition-none`. Sempre acompanhada de "Valores ilustrativos." em caption-green.

### AuthShowcase
O mesmo mundo em painel: floresta 28px dentro das telas de autenticação (a partir de `lg`), três peças que sobem 700ms conforme o slide, pontos de paginação pílula brand-lime, rotação automática de 3,5s pausada em hover/foco e desligada com `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** usar tokens por papel no app (`bg-bg-card`, `text-accent-lime`, `border-accent-lime`) e deixar o Tailwind resolver ink/line.
- **Do** escopar qualquer ajuste do tema claro em `html.light`/`light:` e conferir que o escuro não mudou.
- **Do** construir a ilustração de marca com peças fiéis do app, rotuladas "Valores ilustrativos.".
- **Do** escrever títulos de marca como duas frases curtas, a segunda em brand-lime ou caption-green.
- **Do** usar `tabular-nums` em todo número e a curva `cubic-bezier(0.16,1,0.3,1)` em todo movimento, com fallback para `prefers-reduced-motion`.
- **Do** usar texto com matiz verde (forest-ink-soft, floor-ink, caption-green) sobre o verde e sobre o chão da landing.

### Don't:
- **Don't** usar #bef264, o verde-floresta ou a Bricolage Grotesque dentro das telas do app.
- **Don't** escrever hex solto em componente do app; valor fixo só na camada de marca.
- **Don't** usar #a3e635 como texto sobre fundo claro (1,4:1); use accent-lime-ink.
- **Don't** apresentar recursos na marca como grade de cards idênticos com ícone nem hero centralizado; a peça do app é a ilustração.
- **Don't** inventar prova social (depoimentos, número de usuários, imprensa).
- **Don't** pôr sombra grande em card do app; a profundidade dele é tonal.
