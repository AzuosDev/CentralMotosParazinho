import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PagarFaturaDto {
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  valor!: number;

  @IsOptional()
  @IsString()
  carteiraPagadoraId?: string;
}
