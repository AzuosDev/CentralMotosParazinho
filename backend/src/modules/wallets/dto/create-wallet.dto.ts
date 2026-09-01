import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nome!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  saldo?: number;

  @IsOptional()
  @IsString()
  icone?: string;

  @IsOptional()
  @IsIn(['conta', 'dinheiro', 'credito'])
  tipo?: 'conta' | 'dinheiro' | 'credito';

  @IsOptional()
  @ValidateIf((o) => o.tipo === 'credito')
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  limite?: number;

  @IsOptional()
  @ValidateIf((o) => o.tipo === 'credito')
  @IsNumber()
  @Min(1)
  @Max(31)
  @Type(() => Number)
  diaFechamento?: number;

  @IsOptional()
  @ValidateIf((o) => o.tipo === 'credito')
  @IsNumber()
  @Min(1)
  @Max(31)
  @Type(() => Number)
  diaVencimento?: number;

  @IsOptional()
  @ValidateIf((o) => o.tipo === 'credito')
  @IsString()
  carteiraPagamentoId?: string;

  @IsOptional()
  @ValidateIf((o) => o.tipo === 'credito')
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  taxaJurosRotativo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bandeira?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  ultimosDigitos?: string;
}
