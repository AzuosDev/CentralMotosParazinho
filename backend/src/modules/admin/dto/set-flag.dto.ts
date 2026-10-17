import { IsBoolean } from 'class-validator';

export class SetBloqueioDto {
  @IsBoolean()
  bloqueado!: boolean;
}

export class SetAdminDto {
  @IsBoolean()
  isAdmin!: boolean;
}
