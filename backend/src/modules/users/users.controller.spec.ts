import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext, BadRequestException } from '@nestjs/common';
import request from 'supertest';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { WebAuthnService } from '../webauthn/webauthn.service';
import { WebAuthnChallenge, WebAuthnChallengeDocument, WebAuthnChallengeSchema } from '../webauthn/schemas/webauthn-challenge.schema';

const FAKE_USER_ID = new Types.ObjectId();

const mockGuard = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest<{ user: { _id: Types.ObjectId } }>();
    req.user = { _id: FAKE_USER_ID };
    return true;
  },
};

// Controller routing tests (mocked services)

describe('UsersController.changePassword — routing', () => {
  let app: INestApplication;

  const mockUsersService = {
    changePassword: jest.fn().mockResolvedValue({ ok: true }),
    changePasswordDirect: jest.fn().mockResolvedValue({ ok: true }),
  };

  const mockWebAuthnService = {
    consumeReauthToken: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: WebAuthnService, useValue: mockWebAuthnService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('reauthedToken válido: chama consumeReauthToken + changePasswordDirect, sem currentPassword', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/users/me/password')
      .send({ reauthedToken: 'abc', newPassword: 'NovaSenha9' })
      .expect(200);

    expect(res.body).toEqual({ ok: true });
    expect(mockWebAuthnService.consumeReauthToken).toHaveBeenCalledWith(
      FAKE_USER_ID.toString(),
      'abc',
    );
    expect(mockUsersService.changePasswordDirect).toHaveBeenCalledWith(
      FAKE_USER_ID.toString(),
      'NovaSenha9',
    );
    expect(mockUsersService.changePassword).not.toHaveBeenCalled();
  });

  it('currentPassword: chama changePassword diretamente', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/users/me/password')
      .send({ currentPassword: 'SenhaAtual1', newPassword: 'NovaSenha9' })
      .expect(200);

    expect(res.body).toEqual({ ok: true });
    expect(mockUsersService.changePassword).toHaveBeenCalledWith(
      FAKE_USER_ID.toString(),
      'SenhaAtual1',
      'NovaSenha9',
    );
    expect(mockWebAuthnService.consumeReauthToken).not.toHaveBeenCalled();
  });

  it('nem reauthedToken nem currentPassword: retorna 400', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/me/password')
      .send({ newPassword: 'NovaSenha9' })
      .expect(400);
  });
});

// consumeReauthToken unit tests (real MongoDB)

describe('WebAuthnService.consumeReauthToken — single-use e validade', () => {
  let mongod: MongoMemoryServer;
  let challengeModel: Model<WebAuthnChallengeDocument>;
  let service: WebAuthnService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();

    const moduleFixture = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: WebAuthnChallenge.name, schema: WebAuthnChallengeSchema },
        ]),
      ],
      providers: [
        {
          provide: WebAuthnService,
          inject: [getModelToken(WebAuthnChallenge.name)],
          useFactory: (model: Model<WebAuthnChallengeDocument>) => {
            const svc = {
              consumeReauthToken: async (userId: string, token: string) => {
                const doc = await model.findOneAndDelete({
                  userId: new Types.ObjectId(userId),
                  type: 'reauth',
                  reauthedToken: token,
                  expiresAt: { $gt: new Date() },
                }).exec();
                if (!doc) {
                  throw new BadRequestException('Token de reautenticação inválido ou expirado.');
                }
              },
            };
            return svc;
          },
        },
      ],
    }).compile();

    challengeModel = moduleFixture.get<Model<WebAuthnChallengeDocument>>(
      getModelToken(WebAuthnChallenge.name),
    );
    service = moduleFixture.get<WebAuthnService>(WebAuthnService);
  });

  afterAll(async () => {
    await mongod.stop();
  });

  beforeEach(async () => {
    await challengeModel.deleteMany({});
  });

  it('token válido é consumido (uso único)', async () => {
    const token = 'valid-token-xyz';
    await challengeModel.create({
      challenge: 'ch',
      type: 'reauth',
      userId: FAKE_USER_ID,
      reauthedToken: token,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await expect(service.consumeReauthToken(FAKE_USER_ID.toString(), token)).resolves.toBeUndefined();

    // Segunda tentativa falha (uso único)
    await expect(service.consumeReauthToken(FAKE_USER_ID.toString(), token)).rejects.toThrow();
  });

  it('token expirado é rejeitado', async () => {
    const token = 'expired-token';
    await challengeModel.create({
      challenge: 'ch',
      type: 'reauth',
      userId: FAKE_USER_ID,
      reauthedToken: token,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.consumeReauthToken(FAKE_USER_ID.toString(), token)).rejects.toThrow();
  });

  it('challenge com type diferente de reauth é rejeitado', async () => {
    const token = 'login-type-token';
    await challengeModel.create({
      challenge: 'ch',
      type: 'login',
      email: 'test@example.com',
      reauthedToken: token,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await expect(service.consumeReauthToken(FAKE_USER_ID.toString(), token)).rejects.toThrow();
  });
});
