import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import express from 'express';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';

const server = express();
let app: INestApplication | undefined;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.create(AppModule, new ExpressAdapter(server));
    const configService = app.get(ConfigService);
    const configuredOrigins = (configService.get<string>('FRONTEND_URL') ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean);

    // O Vite sobe em 5174 quando a 5173 já está ocupada (duas instâncias de dev
    // abertas). Esta lista é gêmea da de src/main.ts — mexeu aqui, mexa lá.
    const allowedOrigins = new Set([
      ...configuredOrigins,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'https://meugasto.vercel.app',
    ]);

    app.use(helmet());
    app.enableCors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        const normalizedOrigin = origin.replace(/\/$/, '');
        const isGithubDevOrigin = /^https:\/\/[a-z0-9-]+\.app\.github\.dev$/i.test(normalizedOrigin);

        if (allowedOrigins.has(normalizedOrigin) || isGithubDevOrigin) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS blocked for origin: ${origin}`), false);
      },
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  }
  return server;
}

export default async (req: any, res: any) => {
  const srv = await bootstrap();
  srv(req, res);
};
