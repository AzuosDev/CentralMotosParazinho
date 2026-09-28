import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class VincularContaPendenteDto {
  @IsString()
  @IsNotEmpty()
  pendingAccountId!: string;

  @IsString()
  @IsNotEmpty()
  carteiraId!: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  parcelasJaPagas!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  parcelasRestantes!: number;
}
