import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ADMIN_EMAIL } from '../../common/guards/admin.guard';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AdminModule } from './admin.module';

// Quem está logado em cada teste — o guard real (AdminGuard) decide com base nisto.
let currentUser: { _id: Types.ObjectId; email: string; isAdmin?: boolean };

const mockGuard = {
  canActivate: (context: ExecutionContext) => {
    context.switchToHttp().getRequest().user = currentUser;
    return true;
  },
};

describe('AdminController — gestão de usuários', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let userModel: Model<UserDocument>;
  let root: UserDocument;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }), AdminModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    userModel = moduleFixture.get(getModelToken(User.name));
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await userModel.deleteMany({});
    root = await userModel.create({ email: ADMIN_EMAIL, password: 'x', emailVerified: true });
    currentUser = { _id: root._id, email: ADMIN_EMAIL };
  });

  const http = () => request(app.getHttpServer());
  const novo = { email: 'Cliente@Teste.com', name: 'Cliente', password: 'Senha123', acesso: 'teste', diasTeste: 7 };

  it('cria conta já verificada, com a senha definida pelo admin e o acesso escolhido', async () => {
    const res = await http().post('/api/admin/users').send(novo).expect(201);
    expect(res.body).toMatchObject({ email: 'cliente@teste.com', status: 'em_teste', isAdmin: false, bloqueado: false });

    const salvo = await userModel.findOne({ email: 'cliente@teste.com' }).lean();
    expect(salvo?.emailVerified).toBe(true);
    expect(salvo?.isLegacyFree).toBe(false);
    expect(await bcrypt.compare('Senha123', salvo!.password)).toBe(true);
    const dias = (salvo!.trialEndsAt!.getTime() - Date.now()) / 86400000;
    expect(Math.round(dias)).toBe(7);
  });

  it('acesso "gratis" marca isLegacyFree; "pagante" nasce sem acesso', async () => {
    const g = await http().post('/api/admin/users').send({ ...novo, email: 'g@t.com', acesso: 'gratis' }).expect(201);
    expect(g.body).toMatchObject({ status: 'gratis_liberado', hasAccess: true });
    const p = await http().post('/api/admin/users').send({ ...novo, email: 'p@t.com', acesso: 'pagante' }).expect(201);
    expect(p.body).toMatchObject({ status: 'sem_assinatura', hasAccess: false });
  });

  it('email repetido dá 409 e senha fraca dá 400', async () => {
    await http().post('/api/admin/users').send(novo).expect(201);
    await http().post('/api/admin/users').send(novo).expect(409);
    await http().post('/api/admin/users').send({ ...novo, email: 'x@t.com', password: 'fraca' }).expect(400);
  });

  it('usuário comum não acessa; admin promovido acessa', async () => {
    const comum = await userModel.create({ email: 'comum@t.com', password: 'x' });
    currentUser = { _id: comum._id, email: 'comum@t.com', isAdmin: false };
    await http().get('/api/admin/users').expect(403);
    await http().post('/api/admin/users').send(novo).expect(403);

    currentUser = { _id: root._id, email: ADMIN_EMAIL };
    await http().patch(`/api/admin/users/${comum._id}/admin`).send({ isAdmin: true }).expect(200);

    currentUser = { _id: comum._id, email: 'comum@t.com', isAdmin: true };
    await http().post('/api/admin/users').send(novo).expect(201);
  });

  it('bloqueia e desbloqueia; não bloqueia o admin principal nem a si mesmo', async () => {
    const alvo = await userModel.create({ email: 'alvo@t.com', password: 'x' });
    const b = await http().patch(`/api/admin/users/${alvo._id}/bloqueio`).send({ bloqueado: true }).expect(200);
    expect(b.body).toMatchObject({ bloqueado: true, hasAccess: false });
    await http().patch(`/api/admin/users/${alvo._id}/bloqueio`).send({ bloqueado: false }).expect(200);

    await http().patch(`/api/admin/users/${root._id}/bloqueio`).send({ bloqueado: true }).expect(400);
    await http().patch(`/api/admin/users/${root._id}/admin`).send({ isAdmin: false }).expect(400);

    await userModel.updateOne({ _id: alvo._id }, { isAdmin: true });
    currentUser = { _id: alvo._id, email: 'alvo@t.com', isAdmin: true };
    await http().patch(`/api/admin/users/${alvo._id}/bloqueio`).send({ bloqueado: true }).expect(400);
  });

  it('define e remove o preço próprio de um cliente', async () => {
    const alvo = await userModel.create({ email: 'alvo@t.com', password: 'x' });
    const r = await http().patch(`/api/admin/users/${alvo._id}/preco`).send({ valorMensal: 149.9, valorAnual: null }).expect(200);
    expect(r.body).toMatchObject({ valorMensalPersonalizado: 149.9, valorAnualPersonalizado: null });
    await http().patch(`/api/admin/users/${alvo._id}/preco`).send({ valorMensal: 0, valorAnual: null }).expect(400);
    await http().patch(`/api/admin/users/${alvo._id}/preco`).send({ valorMensal: null, valorAnual: null }).expect(200);
    const salvo = await userModel.findById(alvo._id).lean();
    expect(salvo?.valorMensalPersonalizado).toBeNull();
  });

  it('redefine a senha de um usuário', async () => {
    const alvo = await userModel.create({ email: 'alvo@t.com', password: 'x' });
    await http().patch(`/api/admin/users/${alvo._id}/senha`).send({ password: 'NovaSenha1' }).expect(200);
    const salvo = await userModel.findById(alvo._id).lean();
    expect(await bcrypt.compare('NovaSenha1', salvo!.password)).toBe(true);
  });
});
