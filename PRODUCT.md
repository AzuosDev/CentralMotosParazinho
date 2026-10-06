# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pessoas físicas que querem organizar as finanças do dia a dia, e autônomos/MEIs que misturam gasto pessoal e do trabalho. O trabalho que fazem: saber quanto dinheiro têm agora, não perder vencimentos e entender para onde o dinheiro está indo. O plano Empresarial (versão personalizada para um negócio) é uma audiência secundária, atendida por conversa comercial.

## Product Purpose

MeuGasto é um app web (PWA) de finanças pessoais: carteiras (banco, dinheiro, cartão de crédito com faturas e parcelamentos), gastos e ganhos, contas a pagar e receber (com parcelamento e recorrência), metas financeiras vinculadas a categorias, importação de extrato OFX, insights e dashboard. Sucesso é o usuário abrir o app e confiar no número que vê, sem precisar conferir no banco.

## Positioning

Funciona sem conectar a conta bancária: o usuário lança manualmente ou importa o OFX, e o app nunca acessa o banco diretamente. Trata cartão de crédito como dívida (fatura, parcelamento, estorno), não como dinheiro saindo da conta, então o saldo mostrado é "quanto eu tenho agora" de verdade. É um produto da Azuos Dev.

## Operating Context

Uso em celular e desktop, frequentemente como PWA instalado. Rituais típicos: lançar um gasto na hora, conferir as contas que vencem na semana, fechar o mês, pagar a fatura do cartão. Login pode ser biométrico (passkey/WebAuthn).

## Capabilities and Constraints

- Teste grátis de 15 dias, sem cartão de crédito, só no plano Básico.
- Plano Básico: R$29,90/mês ou R$299,90/ano (~16% de economia, equivale a R$24,99/mês). Troca de ciclo nas configurações, vale a partir do próximo ciclo.
- Plano Empresarial: a partir de R$49,90/mês ou R$599,90/ano, sob consulta, via e-mail ou WhatsApp.
- Cancelamento direto nas configurações da conta.
- Não há integração bancária automática (open finance); isso não deve ser prometido.
- Terminologia pt-BR do domínio: carteira, gasto, ganho/receita, conta pendente, meta, fatura, parcelamento, estorno.

## Brand Commitments

- Nome: Central Motos (Parazinho, Granja - CE). Este sistema é o plano Empresarial do MeuGasto, personalizado para ela; segue assinado "Desenvolvido pela Azuos Dev" (https://azuos-dev.vercel.app/), como todo produto da casa.
- Identidade do produto: automotiva, alto contraste. Preto #050505 de fundo, vermelho #E10600 como única cor de ação e de marca, branco nos títulos e valores, cinzas no apoio. Tema claro espelhado. Corpo em DM Sans auto-hospedada.
- O emblema circular da Central Motos aparece inteiro nas telas de autenticação; na barra lateral e no cabeçalho entra o monograma reduzido mais o lockup "CENTRAL MOTOS".
- A landing pública e as sete páginas temáticas de SEO são herança do MeuGasto e estão ocultas (ver LANDING_VISIVEL em frontend/src/App.tsx): o texto, os preços e o <head> delas ainda são do produto original.
- Voz: pt-BR, direta, próxima, sem jargão financeiro desnecessário.
- Contato: udawgs.org@gmail.com e WhatsApp (88) 9 9678-4110.

## Evidence on Hand

Nenhuma prova social ainda: sem depoimentos, sem números de usuários, sem imprensa. Não inventar nenhuma. A prova disponível é o próprio produto (interfaces reais do app) e fatos verificáveis do funcionamento (sem acesso ao banco, HTTPS, biometria local, cancelamento sem burocracia).

## Product Principles

1. O número mostrado tem que ser o número verdadeiro: saldo é "quanto eu tenho agora".
2. Controle sem entregar a senha do banco.
3. Menos digitação: importar, recorrência e parcelamento fazem o trabalho repetitivo.
4. Honestidade comercial: preço claro, teste sem cartão, cancelar sem ligar para ninguém.
