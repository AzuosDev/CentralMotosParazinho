import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

export const TIPOS_LANCAMENTO_VOZ = ['EXPENSE', 'INCOME', 'TRANSFER'] as const;
export type TipoLancamentoVoz = (typeof TIPOS_LANCAMENTO_VOZ)[number];

export class LancamentoVozDto {
  @IsIn(TIPOS_LANCAMENTO_VOZ)
  type!: TipoLancamentoVoz;

  @IsNumber()
  @Min(0.01)
  @Max(1_000_000_000)
  @Type(() => Number)
  value!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }) : value))
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  carteiraId?: string;

  // Só TRANSFER.
  @IsOptional()
  @IsString()
  carteiraDestinoId?: string;

  // Só compra no cartão de crédito; >= 2 vira Parcelamento.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(48)
  @Type(() => Number)
  parcelas?: number;

  @IsOptional()
  @IsBoolean()
  confirmarMesmoAssim?: boolean;
}

export class ConfirmarVozDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LancamentoVozDto)
  itens!: LancamentoVozDto[];
}
