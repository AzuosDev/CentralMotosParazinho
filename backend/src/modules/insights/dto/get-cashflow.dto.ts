import { IsOptional, IsInt, IsIn, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetCashflowDto {
  @IsOptional()
  @IsIn(['month', 'quarter', 'year', 'custom'])
  period?: 'month' | 'quarter' | 'year' | 'custom';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  quarter?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  year?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
