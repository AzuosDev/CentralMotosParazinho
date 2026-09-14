import { IsBoolean } from 'class-validator';

export class SetFreeAccessDto {
  @IsBoolean()
  isLegacyFree!: boolean;
}
