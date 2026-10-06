---
name: Central Motos
description: Sistema financeiro da Central Motos. Preto, vermelho e branco; alto contraste, estética de painel de instrumentos.
colors:
  bg-base: "#050505"
  bg-card: "#0d0d0d"
  bg-muted: "#1a1a1a"
  bg-overlay: "#262626"
  text-primary: "#ffffff"
  text-secondary: "#a3a3a3"
  text-muted: "#828282"
  border-default: "#333333"
  border-strong: "#4a4a4a"
  accent-brand: "#e10600"
  accent-brand-ink: "#ff3b30"
  accent-brand-hover: "#b80000"
  accent-brand-soft: "#ffe5e5"
  accent-red: "#d31109"
  accent-red-ink: "#ff3b30"
  accent-red-hover: "#a80d07"
  color-income: "#2fb85c"
  color-expense: "#ff3b30"
  color-pending: "#f5a623"
  status-info: "#d4d4d4"
  cat-1: "#e66767"
  cat-2: "#3987e5"
  cat-3: "#d95926"
  cat-4: "#199e70"
  cat-5: "#9085e9"
  cat-6: "#c98500"
  cat-7: "#d55181"
  cat-8: "#008300"
  cat-neutral: "#8a8a8a"
typography:
  brand-lockup:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.14em"
    textTransform: "uppercase"
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
  figure:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "3rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
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
  panel: "28px"
spacing:
  card-sm: "16px"
  card-md: "20px"
  card-lg: "24px"
  gutter-mobile: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent-brand}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-brand-hover}"
    textColor: "{colors.text-primary}"
  button-destructive:
    backgroundColor: "{colors.accent-red}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.icon}"
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
    iconColor: "{colors.accent-brand}"
    rounded: "{rounded.icon}"
    padding: "12px 16px"
  chip-state:
    backgroundColor: "{colors.accent-brand} @ 15%"
    textColor: "{colors.accent-brand-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  instrument-panel:
    backgroundColor: "{colors.bg-card}"
    border: "1px solid rgba(255,255,255,0.10)"
    boxShadow: "0 1.5rem 3rem -1rem rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.07)"
    rounded: "18px"
    padding: "20px"
---

# Design System: Central Motos

## Overview

**Creative North Star: "O painel de instrumentos"**

A Central Motos compra, vende e financia moto. O sistema dela não imita isso com
ilustração de moto: imita o **painel** de uma. Preto profundo, número branco
grande e legível de relance, e um único vermelho que só acende onde há ação ou
alerta. É um instrumento, não um folheto — quem abre quer saber quanto tem e o
que vence, no tempo de um olhar para o velocímetro.

Há duas camadas, como antes, mas agora elas compartilham a mesma paleta em vez
de se contradizerem:

A **camada do app** (dashboard, carteiras, cartões, contas, metas, gastos,
configurações) é um sistema de tokens por papel em `frontend/src/styles.css` +
`tailwind.config.ts`: escuro por padrão (#050505), com tema claro espelhado sob
`html.light`, superfícies que sobem em degraus tonais e um único acento
vermelho. Denso, calmo, funcional; o número é o protagonista.

A **camada de marca** (o painel `AuthShowcase` das telas de autenticação) é o
mesmo mundo em registro expressivo: peças do próprio app desenhadas como
mostradores escuros com régua de luz na borda de cima, sobre um banho de
vermelho baixo — farol batendo no asfalto. É independente de tema (idêntica no
claro e no escuro), por isso suas cores vivem como valores fixos no componente,
não nos tokens.

A landing pública e as sete páginas temáticas de SEO são herança do MeuGasto, o
produto de que este sistema é um fork. Estão **ocultas** (`LANDING_VISIVEL` em
`frontend/src/App.tsx`) e mantêm o visual e o texto antigos: não são referência
para nada aqui.

**Key Characteristics:**
- Um vermelho só, #E10600, com três papéis (fill / ink / line) resolvidos por token.
- Profundidade por degrau tonal no app; por régua de luz e sombra funda na marca.
- Branco é "valor normal"; vermelho é ação, marca e alerta. Saldo positivo **nunca** é vermelho.
- Números sempre tabulares.
- Movimento com uma curva só, `cubic-bezier(0.16, 1, 0.3, 1)`, e `prefers-reduced-motion` respeitado.

## Colors

### Primary
- **Vermelho da marca** (accent-brand): a única cor de ação. Botão principal
  (texto branco, 5,0:1), ícone do item de navegação ativo, anel de foco, barra
  de progresso, link. Hover escurece para `accent-brand-hover` (#B80000 no
  escuro, #990000 no claro) — nunca `brightness`, que lava o vermelho.
- Três papéis, porque um valor só não serve aos dois temas:
  `--accent-brand` preenche, `--accent-brand-ink` escreve, `--accent-brand-line`
  traça. No escuro o ink clareia para **#FF3B30** (5,5:1 sobre o card) porque o
  #E10600 puro dá 3,9:1 ali; no claro o ink escurece para **#B80000** (6,9:1).

### Secondary
- **Semânticas** (color-income #2FB85C, color-expense #FF3B30, color-pending
  #F5A623): entrada, saída, pendente. Só significam dinheiro. No claro escurecem
  para green-700, #C60B00 e yellow-700.
- **status-info é neutro** (#D4D4D4 / #404040), nunca azul: informação não é cor
  de marca. `status-warning` e `status-danger` derivam de pending e expense.

### Neutral
- **Chão** (bg-base #050505): fundo da página.
- **Degraus** (bg-card #0D0D0D, bg-muted #1A1A1A, bg-overlay #262626): card,
  campo/chip/trilho, hover/seção secundária, um degrau acima do outro.
- **Tintas** (text-primary #FFF, text-secondary #A3A3A3 — 7,7:1, text-muted
  #828282 — 5,1:1 sobre o card e 4,5:1 dentro de um campo, que é onde mora o
  placeholder).
- **Linhas** (border-default #333333, border-strong #4A4A4A).

### Categórica (gráficos)
Oito matizes em ordem fixa (`cat-1`…`cat-8`) mais um neutro, em
`frontend/src/lib/colors.ts` e espelhados em `DEFAULT_CATEGORIES` no backend. A
**ordem é o mecanismo de segurança para daltonismo**, não enfeite: foi escolhida
entre as 272 permutações que passam em todas as travas do validador de paleta
liderando pelo vermelho da marca (pior par adjacente ΔE 9,2 CVD / 19,3 visão
normal). Transferências e saques usam `cat-neutral` — não são gasto, então
recuam.

### Named Rules
**The Role Token Rule.** No app, cor só por token (`bg-accent-brand`,
`text-accent-brand`, `border-accent-brand`), nunca hex solto: `text-*` resolve
para a versão ink, `border/ring/stroke` para a line. Valor fixo só é legítimo na
camada de marca (independente de tema) e em `src/lib/colors.ts`, onde a cor
precisa mesmo ser um literal de JavaScript.

**The White Is Normal Rule.** Valor positivo — saldo, saldo de carteira, meta a
alcançar — é **branco**, não vermelho. Vermelho sobre número só significa
negativo, vencido ou destrutivo. Num app de dinheiro, pintar o saldo saudável
com a cor da marca é dizer ao usuário que ele está no prejuízo.

**The Red Fill Takes White Rule.** Todo preenchimento `accent-brand` leva texto
branco. O acento anterior (lima) era claro e pedia texto preto; o vermelho é
escuro e qualquer `text-black` sobre ele é um resto do sistema antigo.

**The Dark-Stays-Put Rule.** Mudança no tema claro fica sob `html.light` (ou a
variante `light:`) e deixa o escuro idêntico ao pixel.

## Typography

**Body Font:** DM Sans (com sans-serif), auto-hospedada em `public/fonts/`
**App heading stack:** `fontFamily.sans` = Syne, sans-serif (configurada, nunca
carregada; renderiza a sans padrão do navegador — pré-existente, não é bug)
**Display Font:** Bricolage Grotesque existe em `public/fonts/` mas só é baixada
nas páginas públicas, que estão ocultas. Nenhuma tela ativa depende dela.

### Hierarchy
- **Brand lockup** (800, 0.9375rem, tracking 0.14em, caixa alta, em duas linhas:
  "CENTRAL" em branco, "MOTOS" em vermelho): barra lateral, cabeçalho, painel de
  autenticação.
- **App title** (700, 1.875rem, tracking-tight): título de página (`PageHeader`).
- **Auth title** (DM Sans 700, 1.875rem, -0.02em): títulos das telas de autenticação.
- **Figure** (800, tabular, -0.02em): saldo e demais valores de destaque.
- **Body** (400, 1rem, 1.625) · **Body small** (500–600, 0.875rem) · **Label** (500, 0.75rem).

### Named Rules
**The Tabular Rule.** Todo valor monetário, porcentagem e dígito de cartão usa
`tabular-nums`.

## Layout

`AppLayout` com barra lateral (itens `rounded-xl`, recolhível para só ícones com
tooltip) e conteúdo em cards; padding interno de card 16/20/24px, cabeçalho de
página com `mb-8`, conteúdo em `max-w-6xl`. Abaixo de `lg`: cabeçalho fixo com
menu em gaveta e barra de navegação inferior de 5 colunas, com o botão de
adicionar em destaque no centro. Tema claro espelha a mesma estrutura.
Breakpoints padrão do Tailwind: sm 640, md 768, lg 1024, xl 1280.

## Elevation & Depth

**O app é plano por degraus tonais:** base → card → muted → overlay, com bordas
`border-default`; sombra só no que flutua (tooltip, menu, modal: `shadow-xl` /
`shadow-2xl`). **A marca é instrumento sobre painel:** peça escura sobre fundo
escuro não se separa por tom, então se separa por **régua de luz** —
`inset 0 1px 0 rgba(255,255,255,0.07)` na borda de cima — mais uma sombra funda
com deslocamento e borrão de verdade.

### Shadow Vocabulary
- **Mostrador** (`0 1.5rem 3rem -1rem rgba(0,0,0,0.85)` + régua de luz): peças do painel de autenticação.
- **Mostrador em foco** (`0 2.25rem 4rem -1rem rgba(0,0,0,0.9)` + régua): a peça do slide ativo.
- **Flutuante do app** (Tailwind `shadow-xl`): menus e tooltips.

### Named Rules
**The Rim Light Rule.** No escuro sobre escuro, o que descola a peça do fundo é
a régua de luz de 1px na borda de cima, não a sombra. Sombra sozinha num fundo
#050505 não aparece.

**The Headlight Rule.** A luz da marca é um único gradiente radial vermelho
(alfa 0,07–0,22) **embaixo** do painel, fora da área de leitura — farol no
asfalto, não halo atrás de texto. Um por superfície.

## Shapes

Tudo arredondado, nada de canto vivo. Pílula para botões e chips, 12px
(`rounded-icon` / `rounded-xl`) para campos, itens de navegação e tiles de
ícone, 16px (`rounded-2xl`, igual a `rounded-card`) para cards, 18px para os
mostradores do painel de autenticação e 28px para o painel em si. O cartão de
crédito mantém a proporção real (1.586) com canto de 14px.

## Components

### Buttons
- **Shape:** pílula no `SubmitButton` dos formulários de autenticação; 12px nos botões de modal e de página.
- **Primary:** `bg-accent-brand` com `text-white`, 14px semibold/bold, `hover:bg-accent-brand-hover`, `disabled:opacity-60`.
- **Destructive:** `bg-accent-red` com `text-white`, `hover:bg-accent-red-hover`.
  O vermelho destrutivo tem fill e ink separados pelo mesmo motivo que o da
  marca: #D31109 aguenta texto branco (5,5:1), #FF3B30 é o que se lê como texto
  sobre o card.
- **Warning:** `bg-accent-yellow` com `text-black` (âmbar é claro, aqui o texto preto está certo).
- **Ghost:** texto `text-text-secondary`, hover `bg-bg-overlay` + `text-text-primary`.

### Chips & Badges
Pílula pequena, fundo do acento a 10–20% e texto na variante ink:
`bg-accent-brand/10 text-accent-brand` (marca), `bg-semantic-income/10
text-semantic-income` (pago/recebido), `bg-accent-yellow/15 text-accent-yellow`
(parcial/vence hoje), `bg-accent-red/10 text-accent-red` (vencida),
`bg-status-info/15 text-status-info` (agendado, recorrente, parcela — neutro).

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** `bg-bg-card`, às vezes com borda `border-bg-muted`.
- **Shadow Strategy:** nenhuma; profundidade é tonal.
- **Internal Padding:** 16–24px.

### Inputs / Fields
- **Style:** fundo `bg-bg-muted`, borda transparente, 12px, ícone em `text-text-secondary`, rótulo 12px acima.
- **Focus:** borda `accent-brand` (line) + anel `accent-brand/20`.
- **Error:** borda `accent-red` e mensagem 12px em `accent-red`.

### Navigation
- **Barra lateral:** itens 14px medium em `text-text-secondary`; hover `bg-bg-overlay`; ativo `bg-bg-muted` + `text-text-primary` com o ícone em `accent-brand`. A logo recolhida é o monograma e serve de botão de expandir.
- **Barra inferior (mobile):** ativo em `text-accent-brand`; o botão de adicionar é um disco `accent-brand` com ícone branco e sombra `shadow-accent-brand/40`.

### Browser surfaces
Seleção, cursor de texto, `accent-color` dos controles nativos, barra de
rolagem e anel de foco vêm da paleta nos **dois** temas (`@layer base` em
`styles.css`). O azul padrão do sistema não aparece em lugar nenhum.

### AuthShowcase (signature)
Painel 28px dentro das telas de autenticação (a partir de `lg`): emblema da
Central Motos no topo, três mostradores (cartão, fatura, meta como ponteiro de
conta-giros em arco de 240°, conta a vencer), banho de vermelho embaixo,
ranhura diagonal fina como textura. Rotação automática de 3,5s pausada em
hover/foco e desligada com `prefers-reduced-motion`; pontos de paginação pílula
em `#e10600`.

## Do's and Don'ts

### Do:
- **Do** usar tokens por papel (`bg-accent-brand`, `text-accent-brand`, `border-accent-brand`) e deixar o Tailwind resolver ink/line.
- **Do** pôr `text-white` em cima de todo preenchimento vermelho.
- **Do** deixar valor positivo em branco e reservar o vermelho para negativo, vencido, destrutivo e ação.
- **Do** escopar ajuste de tema claro em `html.light`/`light:` e conferir que o escuro não mudou.
- **Do** usar `tabular-nums` em todo número e a curva `cubic-bezier(0.16,1,0.3,1)` em todo movimento.
- **Do** tirar cor de série nova da paleta categórica, na ordem, e rodar o validador se mexer nela.

### Don't:
- **Don't** usar azul, roxo ou verde como cor decorativa; verde só significa entrada/concluído, âmbar só pendente, e informação é neutra.
- **Don't** escrever hex solto em componente do app; valor fixo só na camada de marca e em `src/lib/colors.ts`.
- **Don't** usar `hover:brightness-110` num preenchimento vermelho — ele lava a cor; o hover escurece para `accent-brand-hover`.
- **Don't** usar #E10600 como texto sobre superfície escura (3,9:1); use `text-accent-brand`, que resolve para a variante ink.
- **Don't** confiar em sombra para separar peça escura de fundo escuro; é a régua de luz que faz isso.
- **Don't** tomar a landing ou as páginas públicas como referência: estão ocultas e ainda são do MeuGasto.
