import { IsIn, IsOptional } from 'class-validator';
import { MOTO_STATUS, MotoStatus } from '../schemas/moto.schema';

export class GetMotosDto {
  @IsOptional()
  @IsIn(MOTO_STATUS)
  status?: MotoStatus;
}
