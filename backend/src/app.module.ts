import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { PendingModule } from './modules/pending/pending.module';
import { GoalsModule } from './modules/goals/goals.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { InsightsModule } from './modules/insights/insights.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { ImportModule } from './modules/import/import.module';
import { WebAuthnModule } from './modules/webauthn/webauthn.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BillingModule } from './modules/billing/billing.module';
import { CartoesModule } from './modules/cartoes/cartoes.module';
import { SupportModule } from './modules/support/support.module';
import { AdminModule } from './modules/admin/admin.module';
import { MotosModule } from './modules/motos/motos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI');

        if (uri && uri.trim()) {
          // O default de 30s do driver e maior que o limite de execucao da funcao na
          // Vercel: a funcao e morta antes de o Mongoose rejeitar, entao a falha de
          // conexao nunca vira excecao — some num FUNCTION_INVOCATION_FAILED generico,
          // sem mensagem. Desistir antes disso faz o erro real aparecer.
          return { uri, serverSelectionTimeoutMS: 8000 };
        }

        // mongodb-memory-server baixa um binario de ~100MB em runtime: numa funcao
        // serverless isso trava ate a plataforma matar o processo, sem lancar nada —
        // o boot nunca settla e a falha vira um 500 opaco. VERCEL entra na guarda
        // porque NODE_ENV nem sempre chega como "production" no runtime da funcao.
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error(
            `MONGODB_URI ausente no ambiente (NODE_ENV=${process.env.NODE_ENV ?? "undefined"}, VERCEL=${process.env.VERCEL ?? "undefined"})`,
          );
        }

        const { MongoMemoryServer } = await import('mongodb-memory-server');
        const mongoServer = await MongoMemoryServer.create();
        return { uri: mongoServer.getUri() };
      },
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot({ ttl: 60, limit: 100 }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    TransactionsModule,
    PendingModule,
    GoalsModule,
    DashboardModule,
    InsightsModule,
    ExpensesModule,
    WalletsModule,
    ImportModule,
    WebAuthnModule,
    NotificationsModule,
    BillingModule,
    CartoesModule,
    SupportModule,
    AdminModule,
    MotosModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
