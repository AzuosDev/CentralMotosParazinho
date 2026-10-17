import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateCheckoutDto {
  // 'basico' era o nome do plano antes do Plano Empresarial — ainda aceito para um
  // frontend antigo em cache, mas a cobrança é sempre feita como 'empresarial'.
  @IsEnum(['empresarial', 'basico'])
  plan!: 'empresarial' | 'basico';

  @IsEnum(['monthly', 'annual'])
  cycle!: 'monthly' | 'annual';

  // Pagamento só por PIX (o cartão via Stripe foi removido).
  @IsOptional()
  @IsIn(['pix'], { message: 'O pagamento é feito somente por PIX' })
  method?: 'pix';

  @IsOptional()
  @IsString()
  cpfCnpj?: string;
}
