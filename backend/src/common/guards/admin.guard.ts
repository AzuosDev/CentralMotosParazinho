import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Conta que loga no próprio MeuGasto com este email — distinto de BRAND.supportEmail,
// que é o contato de suporte mostrado aos usuários no rodapé dos emails. Espelhado em
// frontend/src/lib/brand.ts (só decide se o link/rota aparece na UI; a checagem real é esta).
export const ADMIN_EMAIL = 'azuos.org@gmail.com';

// Usado depois de JwtAuthGuard (que popula request.user). Não existe conceito de "role"
// nesta base — o único admin é a conta cujo email bate com ADMIN_EMAIL.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const email = request.user?.email;

    if (email !== ADMIN_EMAIL) {
      throw new ForbiddenException('Acesso restrito ao suporte.');
    }

    return true;
  }
}
