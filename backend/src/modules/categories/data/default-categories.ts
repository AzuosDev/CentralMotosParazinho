/*
 * Os hex vêm da paleta categórica validada em frontend/src/lib/colors.ts — oito
 * matizes em ordem fixa, atribuídos aqui por domínio, mais o neutro para o que
 * não é gasto (transferências, saques). Não há pacote de tipos compartilhado
 * entre os dois projetos: se mudar lá, mude aqui.
 */
export const DEFAULT_CATEGORIES = [
  { name: 'Educação', slug: 'educacao', icon: 'GraduationCap', color: '#9085E9', isDefault: true },
  { name: 'Eletrônicos', slug: 'eletronicos', icon: 'Laptop', color: '#3987E5', isDefault: true },
  { name: 'Transferência Conta Própria', slug: 'transferencia-conta-propria', icon: 'ArrowLeftRight', color: '#8A8A8A', isDefault: true },
  { name: 'Transferências', slug: 'transferencias', icon: 'ArrowLeftRight', color: '#8A8A8A', isDefault: true },
  { name: 'Transferências Recebidas', slug: 'transferencias-recebidas', icon: 'ArrowLeftRight', color: '#8A8A8A', isDefault: true, isIncome: true },
  { name: 'Assinaturas Digitais', slug: 'assinaturas-digitais', icon: 'Repeat', color: '#9085E9', isDefault: true },
  { name: 'Cartão de Crédito', slug: 'cartao-credito', icon: 'CreditCard', color: '#E66767', isDefault: true },
  // Usadas pelos lançamentos que a ficha da moto gera (MotosService). Ficam aqui, como
  // categoria de sistema (userId null), em vez de serem criadas por usuário: o índice
  // único { slug, isDefault } não permitiria o mesmo slug para dois usuários.
  { name: 'Compra de Moto', slug: 'compra-de-moto', icon: 'Bike', color: '#D95926', isDefault: true },
  { name: 'Casa', slug: 'casa', icon: 'Home', color: '#C98500', isDefault: true },
  { name: 'Comida e Bebida', slug: 'comida-bebida', icon: 'UtensilsCrossed', color: '#D95926', isDefault: true },
  { name: 'Compras', slug: 'compras', icon: 'ShoppingBag', color: '#E66767', isDefault: true },
  { name: 'Contas e Serviços', slug: 'contas-servicos', icon: 'FileText', color: '#C98500', isDefault: true },
  { name: 'Empréstimos', slug: 'emprestimos', icon: 'Banknote', color: '#E66767', isDefault: true },
  { name: 'Entretenimento', slug: 'entretenimento', icon: 'Tv2', color: '#D95926', isDefault: true },
  { name: 'Esportes', slug: 'esportes', icon: 'Dumbbell', color: '#199E70', isDefault: true },
  { name: 'Impostos', slug: 'impostos', icon: 'Receipt', color: '#C98500', isDefault: true },
  { name: 'Investimento', slug: 'investimento', icon: 'TrendingUp', color: '#008300', isDefault: true },
  { name: 'Roupas', slug: 'roupas', icon: 'Shirt', color: '#D55181', isDefault: true },
  { name: 'Saques', slug: 'saques', icon: 'Wallet', color: '#8A8A8A', isDefault: true },
  { name: 'Saúde e Cuidados Pessoais', slug: 'saude', icon: 'HeartPulse', color: '#199E70', isDefault: true },
  { name: 'Serviços Profissionais', slug: 'servicos-profissionais', icon: 'Briefcase', color: '#3987E5', isDefault: true },
  { name: 'Supermercado', slug: 'supermercado', icon: 'ShoppingCart', color: '#199E70', isDefault: true },
  { name: 'Taxas', slug: 'taxas', icon: 'Percent', color: '#C98500', isDefault: true },
  { name: 'Transporte', slug: 'transporte', icon: 'Car', color: '#3987E5', isDefault: true },
  { name: 'Viagens', slug: 'viagens', icon: 'Plane', color: '#9085E9', isDefault: true },
  // Categorias de ganhos (entradas)
  { name: 'Salário / Pró-labore', slug: 'salario', icon: 'Briefcase', color: '#008300', isDefault: true, isIncome: true },
  { name: 'Serviços Prestados', slug: 'servicos-prestados', icon: 'Wrench', color: '#199E70', isDefault: true, isIncome: true },
  { name: 'Venda de Produtos', slug: 'venda-produtos', icon: 'Package', color: '#3987E5', isDefault: true, isIncome: true },
  { name: 'Rendimentos', slug: 'rendimentos', icon: 'TrendingUp', color: '#9085E9', isDefault: true, isIncome: true },
  { name: 'Cashback / Reembolso', slug: 'cashback', icon: 'RefreshCcw', color: '#C98500', isDefault: true, isIncome: true },
  { name: 'Venda de Moto', slug: 'venda-de-moto', icon: 'Bike', color: '#008300', isDefault: true, isIncome: true },
  { name: 'Outras Entradas', slug: 'outras-entradas', icon: 'Gift', color: '#8A8A8A', isDefault: true, isIncome: true },
];
