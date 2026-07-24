import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { ConfigService } from "@nestjs/config";
import type { Request, Response, NextFunction } from "express";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);
  const configuredOrigins = (configService.get<string>("FRONTEND_URL") ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

  const allowedOrigins = new Set([
    ...configuredOrigins,
    "http://localhost:5173",
    "https://meugasto.vercel.app",
  ]);

  app.use(helmet());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    next();
  });

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = origin.replace(/\/$/, "");
      const isGithubDevOrigin =
        /^https:\/\/[a-z0-9-]+\.app\.github\.dev$/i.test(normalizedOrigin);

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

  if (process.env.NODE_ENV !== "production") {
    const { SwaggerModule, DocumentBuilder } = await import("@nestjs/swagger");
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MeuGasto API')
      .setDescription('MeuGasto backend API')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'Authorization')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  await app.listen(3000);
}

bootstrap();
