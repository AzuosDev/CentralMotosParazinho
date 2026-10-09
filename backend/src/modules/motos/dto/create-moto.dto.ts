import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMotoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  modelo!: string;

  @IsInt()
  @Type(() => Number)
  @Min(1900)
  @Max(2200)
  ano!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  placa!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  chassi!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  cor!: string;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  km!: number;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  valorCompra!: number;

  @IsDateString()
  dataCompra!: string;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  margemDesejada!: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  precoAnunciado?: number;
}
