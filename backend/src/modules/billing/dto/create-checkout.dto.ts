import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateCheckoutDto {
  // 'basico' era o nome do plano antes do Plano Empresarial — ainda aceito para um
  // frontend antigo em cache, mas a cobrança é sempre feita como 'empresarial'.
  @IsEnum(['empresarial', 'basico'])
  plan!: 'empresarial' | 'basico';

  @IsEnum(['monthly', 'annual'])
  cycle!: 'monthly' | 'annual';

  @IsEnum(['stripe', 'pix'])
  method!: 'stripe' | 'pix';

  @IsOptional()
  @IsString()
  cpfCnpj?: string;
}
