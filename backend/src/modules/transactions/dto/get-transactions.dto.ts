import { IsBoolean, IsEnum, IsOptional, IsPositive } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TransactionType } from '../schemas/transaction.schema';

export class GetTransactionsDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  year?: number;

  @IsOptional()
  categoryId?: string;

  @IsOptional()
  carteiraId?: string;

  @IsOptional()
  motoId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  semCategoria?: boolean;
}
