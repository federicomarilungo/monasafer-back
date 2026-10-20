import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { AppModule } from '../app.module';
import { MonasaferService } from './monasafer.service';
import { VerificadorGoogle } from '../auth/google';

// Prueba la API entera contra un Mongo en memoria. Hoy = 15/10/2026.
jest.setTimeout(60000);
const USD = (n: number) => Math.round(n * 100);

describe('API de Monasafer', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    process.env.AUTH_SECRET = 's'.repeat(40);
    process.env.GOOGLE_CLIENT_ID = 'cliente-test.apps.googleusercontent.com';
    mongo = await MongoMemoryServer.create();
    const mod = await Test.createTestingModule({
      imports: [AppModule.crear(mongo.getUri('monasafer'))],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    jest
      .spyOn(mod.get(MonasaferService), 'hoy')
      .mockReturnValue(new Date(2026, 9, 15));
    // Credencial falsa "google:<sub>:<email>" en lugar del ID token firmado por Google.
    jest
      .spyOn(mod.get(VerificadorGoogle), 'verificar')
      .mockImplementation(async (credencial, clientId) => {
        const [tipo, sub, email] = credencial.split(':');
        if (tipo !== 'google' || clientId !== process.env.GOOGLE_CLIENT_ID)
          return null;
        return { sub, email, nombre: 'Fede G' };
      });
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  async function cuenta(email: string) {
    const r = await http
      .post('/auth/registro')
      .send({ email, clave: 'bananas123', nombre: 'Fede' })
      .expect(201);
    return {
      token: r.body.token as string,
      auth: { Authorization: `Bearer ${r.body.token}` },
    };
  }

  it('sin token todo lo privado da 401; ping y salud son públicos', async () => {
    await http.get('/perfil').expect(401);
    await http
      .get('/gastos')
      .set({ Authorization: 'Bearer basura' })
      .expect(401);
    await http.get('/ping').expect(200);
    const s = await http.get('/salud').expect(200);
    expect(s.body.base).toBe(true);
  });

  it('registro, login y validaciones', async () => {
    await cuenta('login@test.com');
    await http
      .post('/auth/registro')
      .send({ email: 'login@test.com', clave: 'bananas123' })
      .expect(409);
    await http
      .post('/auth/registro')
      .send({ email: 'corta@test.com', clave: '123' })
      .expect(400);
    await http
      .post('/auth/login')
      .send({ email: 'LOGIN@test.com', clave: 'mal-clave' })
      .expect(401);
    const r = await http
      .post('/auth/login')
      .send({ email: 'LOGIN@test.com', clave: 'bananas123' })
      .expect(200);
    expect(r.body.perfil.email).toBe('login@test.com');
    expect(r.body.perfil.hashClave).toBeUndefined();
  });

  it('entrar con Google: crea la cuenta y la segunda vez entra a la misma', async () => {
    const c = await http.get('/auth/config').expect(200);
    expect(c.body.googleClientId).toBe(process.env.GOOGLE_CLIENT_ID);
    await http
      .post('/auth/google')
      .send({ credencial: 'basura' })
      .expect(401);
    await http.post('/auth/google').send({}).expect(400);
    const a = await http
      .post('/auth/google')
      .send({ credencial: 'google:111:nueva@gmail.com' })
      .expect(200);
    expect(a.body.nuevo).toBe(true);
    expect(a.body.perfil).toMatchObject({
      email: 'nueva@gmail.com',
      nombre: 'Fede G',
      google: true,
    });
    const b = await http
      .post('/auth/google')
      .send({ credencial: 'google:111:nueva@gmail.com' })
      .expect(200);
    expect(b.body.nuevo).toBe(false);
    expect(b.body.perfil.id).toBe(a.body.perfil.id);
    await http
      .get('/perfil')
      .set({ Authorization: `Bearer ${b.body.token}` })
      .expect(200);
    const l = await http
      .post('/auth/login')
      .send({ email: 'nueva@gmail.com', clave: 'lo-que-sea' })
      .expect(401);
    expect(l.body.message).toMatch(/Google/);
  });

  it('Google con el email de una cuenta con contraseña: la vincula, borra la contraseña y cierra las sesiones viejas', async () => {
    const vieja = await cuenta('dueno@gmail.com');
    await http.get('/perfil').set(vieja.auth).expect(200);
    await new Promise((r) => setTimeout(r, 1100)); // iat va en segundos
    const g = await http
      .post('/auth/google')
      .send({ credencial: 'google:222:dueno@gmail.com' })
      .expect(200);
    expect(g.body.nuevo).toBe(false);
    expect(g.body.perfil.nombre).toBe('Fede'); // no pisa el nombre que ya tenía
    await http
      .get('/perfil')
      .set({ Authorization: `Bearer ${g.body.token}` })
      .expect(200);
    await http.get('/perfil').set(vieja.auth).expect(401);
    await http
      .post('/auth/login')
      .send({ email: 'dueno@gmail.com', clave: 'bananas123' })
      .expect(401);
  });

  it('el flujo completo del mes: saldo, gastos, pagar, reservas y proyección', async () => {
    const { auth } = await cuenta('flujo@test.com');
    await http
      .patch('/perfil')
      .set(auth)
      .send({
        saldo: USD(1000),
        ingresoMensual: { monto: USD(800), diaCobro: 5 },
      })
      .expect(200);

    const alq = (
      await http
        .post('/gastos')
        .set(auth)
        .send({
          nombre: 'Alquiler',
          monto: USD(400),
          tipo: 'fijo',
          mesInicio: '2026-01',
        })
        .expect(201)
    ).body;
    await http
      .post('/gastos')
      .set(auth)
      .send({
        nombre: 'Zapatillas',
        monto: USD(60),
        tipo: 'fijo',
        mesInicio: '2026-06',
        mesFin: '2026-11',
      })
      .expect(201);
    await http
      .post('/gastos')
      .set(auth)
      .send({
        nombre: 'Cena',
        monto: USD(40),
        tipo: 'puntual',
        mesInicio: '2026-10',
      })
      .expect(201);
    const tr = (
      await http
        .post('/gastos')
        .set(auth)
        .send({
          nombre: 'Transporte',
          monto: USD(200),
          tipo: 'reserva',
          mesInicio: '2026-10',
          recurrente: true,
          modoReserva: 'manual',
        })
        .expect(201)
    ).body;

    // Ingreso de octubre sin cobrar: 1000 + 800 - (400 + 60 + 40 + 200) = 1100
    expect(
      (await http.get('/meses/2026-10').set(auth).expect(200)).body.balance,
    ).toBe(USD(1100));

    // Cobrar suma al saldo una sola vez; el balance no cambia
    expect(
      (await http.post('/perfil/cobrar-ingreso').set(auth).expect(200)).body
        .saldo,
    ).toBe(USD(1800));
    await http.post('/perfil/cobrar-ingreso').set(auth).expect(409);
    expect((await http.get('/meses/2026-10').set(auth)).body.balance).toBe(
      USD(1100),
    );

    // Pagar descuenta del saldo y el balance queda igual; despagar lo devuelve
    expect(
      (
        await http
          .post(`/gastos/${alq.id}/meses/2026-10/pagar`)
          .set(auth)
          .expect(200)
      ).body.saldo,
    ).toBe(USD(1400));
    await http
      .post(`/gastos/${alq.id}/meses/2026-10/pagar`)
      .set(auth)
      .expect(409);
    expect((await http.get('/meses/2026-10').set(auth)).body.balance).toBe(
      USD(1100),
    );
    expect(
      (
        await http
          .delete(`/gastos/${alq.id}/meses/2026-10/pagar`)
          .set(auth)
          .expect(200)
      ).body.saldo,
    ).toBe(USD(1800));
    await http
      .post(`/gastos/${alq.id}/meses/2026-10/pagar`)
      .set(auth)
      .expect(200);

    // Uso de reserva: baja el saldo y lo que queda en la reserva, balance igual
    const uso = (
      await http
        .post(`/gastos/${tr.id}/usos`)
        .set(auth)
        .send({ mes: '2026-10', monto: USD(50), nota: 'SUBE' })
        .expect(201)
    ).body;
    const oct = (await http.get('/meses/2026-10').set(auth)).body;
    expect(oct.inicio).toBe(USD(1350));
    expect(
      oct.gastos.find((g: { gastoId: string }) => g.gastoId === tr.id)
        .pendiente,
    ).toBe(USD(150));
    expect(oct.balance).toBe(USD(1100));
    expect(
      (await http.get(`/gastos/${tr.id}/usos?mes=2026-10`).set(auth)).body,
    ).toHaveLength(1);
    await http.delete(`/usos/${uso.id}`).set(auth).expect(200);
    expect((await http.get('/perfil').set(auth)).body.saldo).toBe(USD(1400));

    // Monto distinto en noviembre y proyección: nov = 1100 + 800 - (450 + 60 + 200) = 1190; dic = 1190 + 800 - 600 = 1390
    await http
      .put(`/gastos/${alq.id}/meses/2026-11`)
      .set(auth)
      .send({ montoDelMes: USD(450) })
      .expect(200);
    const p = (
      await http.get('/proyeccion?hasta=2026-12').set(auth).expect(200)
    ).body;
    expect(p.map((m: { balance: number }) => m.balance)).toEqual([
      USD(1100),
      USD(1190),
      USD(1390),
    ]);

    // /datos trae lo necesario para que el front calcule solo
    const d = (await http.get('/datos').set(auth).expect(200)).body;
    expect(d.mesActual).toBe('2026-10');
    expect(d.gastos).toHaveLength(4);
    // Los usos del mes anterior vienen para la sugerencia de M2 y no cambian el cálculo
    await http
      .post(`/gastos/${tr.id}/usos`)
      .set(auth)
      .send({ mes: '2026-09', monto: USD(260) })
      .expect(201);
    const d2 = (await http.get('/datos').set(auth)).body;
    expect(d2.usos.map((u: { mes: string }) => u.mes)).toContain('2026-09');

    // Archivar saca el gasto de todo
    await http.delete(`/gastos/${tr.id}`).set(auth).expect(200);
    expect((await http.get('/gastos').set(auth)).body).toHaveLength(3);
  });

  it('un usuario no puede ver ni tocar lo de otro', async () => {
    const a = await cuenta('a@test.com');
    const b = await cuenta('b@test.com');
    const g = (
      await http
        .post('/gastos')
        .set(a.auth)
        .send({
          nombre: 'Secreto',
          monto: USD(10),
          tipo: 'puntual',
          mesInicio: '2026-10',
        })
        .expect(201)
    ).body;
    expect((await http.get('/gastos').set(b.auth)).body).toHaveLength(0);
    await http
      .patch(`/gastos/${g.id}`)
      .set(b.auth)
      .send({ monto: 1 })
      .expect(404);
    await http
      .post(`/gastos/${g.id}/meses/2026-10/pagar`)
      .set(b.auth)
      .expect(404);
    await http.delete(`/gastos/${g.id}`).set(b.auth).expect(404);
  });

  it('rechaza datos inválidos', async () => {
    const { auth } = await cuenta('invalido@test.com');
    await http
      .post('/gastos')
      .set(auth)
      .send({ nombre: 'x', monto: 10.5, tipo: 'fijo', mesInicio: '2026-10' })
      .expect(400);
    await http
      .post('/gastos')
      .set(auth)
      .send({ nombre: 'x', monto: 10, tipo: 'otro', mesInicio: '2026-10' })
      .expect(400);
    await http
      .post('/gastos')
      .set(auth)
      .send({ nombre: 'x', monto: 10, tipo: 'fijo', mesInicio: '2026-13' })
      .expect(400);
    await http
      .post('/gastos')
      .set(auth)
      .send({
        nombre: 'x',
        monto: 10,
        tipo: 'fijo',
        mesInicio: '2026-10',
        mesFin: '2026-09',
      })
      .expect(400);
    await http.get('/meses/2026-09').set(auth).expect(400);
    await http
      .get('/gastos/no-es-un-id/usos?mes=2026-10')
      .set(auth)
      .expect(404);
  });
});
