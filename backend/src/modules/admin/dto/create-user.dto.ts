import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export type AcessoInicial = 'gratis' | 'teste' | 'pagante';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  // Senha inicial definida pelo admin — mesma regra do antigo cadastro público.
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Z])(?=.*\d)/, { message: 'A senha precisa ter uma letra maiúscula e um número' })
  password!: string;

  // gratis = isLegacyFree; teste = trial por diasTeste dias; pagante = sem acesso até pagar.
  @IsIn(['gratis', 'teste', 'pagante'])
  acesso!: AcessoInicial;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  diasTeste?: number;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;
}
