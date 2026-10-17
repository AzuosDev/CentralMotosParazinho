import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Conta que loga no próprio sistema com este email — distinto de BRAND.supportEmail,
// que é o contato de suporte mostrado aos usuários no rodapé dos emails. O frontend não
// conhece este email: ele lê `isAdmin`, que GET /api/auth/me já devolve calculado
// (UsersService#findById) e só decide se o link/rota aparece; a checagem real é esta.
export const ADMIN_EMAIL = 'azuos.org@gmail.com';

// ADMIN_EMAIL é o admin raiz (sempre admin, não pode ser rebaixado nem bloqueado);
// os demais são contas com isAdmin: true, promovidas por um admin no Painel Admin.
export function isAdminUser(user?: { email?: string; isAdmin?: boolean } | null): boolean {
  return !!user && (user.email === ADMIN_EMAIL || user.isAdmin === true);
}

// Usado depois de JwtAuthGuard (que popula request.user com o documento do usuário).
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    if (!isAdminUser(request.user)) {
      throw new ForbiddenException('Acesso restrito ao suporte.');
    }

    return true;
  }
}
