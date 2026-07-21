import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateCheckoutDto {
  @IsEnum(['basico'])
  plan!: 'basico';

  @IsEnum(['monthly', 'annual'])
  cycle!: 'monthly' | 'annual';

  @IsEnum(['stripe', 'pix'])
  method!: 'stripe' | 'pix';

  @IsOptional()
  @IsString()
  cpfCnpj?: string;
}
