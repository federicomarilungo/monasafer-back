import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { AppModule } from '../app.module';
import { MonasaferService } from '../datos/monasafer.service';
import { CajonService } from './cajon.service';

// El cajón de bananas contra un Mongo en memoria. Hoy = 15/10/2026.
jest.setTimeout(60000);
const USD = (n: number) => Math.round(n * 100);

describe('Cajón de bananas', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let auth: { Authorization: string };

  beforeAll(async () => {
    process.env.AUTH_SECRET = 's'.repeat(40);
    mongo = await MongoMemoryServer.create();
    const mod = await Test.createTestingModule({
      imports: [AppModule.crear(mongo.getUri('monasafer'))],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    const hoy = new Date(2026, 9, 15);
    jest.spyOn(mod.get(MonasaferService), 'hoy').mockReturnValue(hoy);
    jest.spyOn(mod.get(CajonService), 'hoy').mockReturnValue(hoy);
    http = request(app.getHttpServer());
    auth = await cuenta('fede@test.com');
    await http
      .patch('/perfil')
      .set(auth)
      .send({ saldo: USD(1000), moneda: 'ARS' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  async function cuenta(email: string) {
    const r = await http
      .post('/auth/registro')
      .set('do-connecting-ip', email)
      .send({ email, clave: 'bananas123' })
      .expect(201);
    return { Authorization: `Bearer ${r.body.token}` };
  }

  const saldo = async () =>
    (await http.get('/perfil').set(auth).expect(200)).body.saldo;
  const cajon = async () =>
    (await http.get('/cajon').set(auth).expect(200)).body;

  it('ahorrar en dólares: sale del saldo, entra en USD y el balance lo sabe', async () => {
    const dolar = (
      await http
        .post('/cajon/bolsillos')
        .set(auth)
        .send({ nombre: 'Dólar', emoji: '💵', unidad: 'USD' })
        .expect(201)
    ).body;
    expect(dolar).toMatchObject({ unidad: 'USD', decimales: 2, cantidad: 0 });
    // Compré 230 USD con 300 de mi saldo.
    await http
      .post('/cajon/ahorrar')
      .set(auth)
      .send({
        monto: USD(300),
        origen: 'acumulado',
        bolsilloId: dolar.id,
        cantidad: USD(230),
      })
      .expect(201);
    expect(await saldo()).toBe(USD(700));
    const c = await cajon();
    expect(c.bolsillos).toEqual([
      expect.objectContaining({ nombre: 'Dólar', cantidad: USD(230) }),
    ]);
    expect(c.movimientos[0]).toMatchObject({
      tipo: 'ahorro',
      monto: USD(300),
      cantidad: USD(230),
    });
    const d = (await http.get('/datos').set(auth).expect(200)).body;
    expect(d.ahorros).toEqual([
      { mes: '2026-10', monto: USD(300), origen: 'acumulado' },
    ]);
    // Sin decir cuántos dólares quedaron, no se puede.
    await http
      .post('/cajon/ahorrar')
      .set(auth)
      .send({ monto: USD(10), origen: 'mes', bolsilloId: dolar.id })
      .expect(400);
  });

  it('omitir manda a "Sin asignar" en la moneda de la cuenta y después se reparte', async () => {
    await http
      .post('/cajon/ahorrar')
      .set(auth)
      .send({ monto: USD(100), origen: 'mes' })
      .expect(201);
    let c = await cajon();
    const sin = c.bolsillos.find((b: { generico: boolean }) => b.generico);
    expect(sin).toMatchObject({
      nombre: 'Sin asignar',
      unidad: 'ARS',
      cantidad: USD(100),
    });
    const dolar = c.bolsillos.find(
      (b: { nombre: string }) => b.nombre === 'Dólar',
    );
    // 60 pesos se convierten en 50 dólares.
    await http
      .post('/cajon/traspasar')
      .set(auth)
      .send({ desde: sin.id, hacia: dolar.id, cantidad: USD(60) })
      .expect(400); // distinta unidad: falta cuánto entró
    await http
      .post('/cajon/traspasar')
      .set(auth)
      .send({
        desde: sin.id,
        hacia: dolar.id,
        cantidad: USD(60),
        cantidadEntra: USD(50),
      })
      .expect(201);
    await http
      .post('/cajon/traspasar')
      .set(auth)
      .send({
        desde: sin.id,
        hacia: dolar.id,
        cantidad: USD(999),
        cantidadEntra: 1,
      })
      .expect(409);
    c = await cajon();
    expect(c.bolsillos.map((b: { cantidad: number }) => b.cantidad)).toEqual([
      USD(280),
      USD(40),
    ]);
    expect(await saldo()).toBe(USD(600));
  });

  it('editar el total pide detalle y queda en la auditoría sin tocar el saldo', async () => {
    const dolar = (await cajon()).bolsillos[0];
    const m = (
      await http
        .post(`/cajon/bolsillos/${dolar.id}/ajustar`)
        .set(auth)
        .send({ cantidad: USD(240), detalle: 'Viaje' })
        .expect(201)
    ).body;
    expect(m).toMatchObject({
      tipo: 'gasto',
      cantidad: -USD(40),
      detalle: 'Viaje',
    });
    await http
      .post(`/cajon/bolsillos/${dolar.id}/ajustar`)
      .set(auth)
      .send({ cantidad: USD(245), detalle: 'Intereses' })
      .expect(201);
    expect((await cajon()).bolsillos[0].cantidad).toBe(USD(245));
    expect(await saldo()).toBe(USD(600));
  });

  it('volver a la cuenta: vendo 45 dólares y entran 50 al saldo', async () => {
    const dolar = (await cajon()).bolsillos[0];
    await http
      .post(`/cajon/bolsillos/${dolar.id}/retirar`)
      .set(auth)
      .send({ cantidad: USD(1000), monto: USD(1) })
      .expect(409);
    await http
      .post(`/cajon/bolsillos/${dolar.id}/retirar`)
      .set(auth)
      .send({ cantidad: USD(45), monto: USD(50) })
      .expect(201);
    expect(await saldo()).toBe(USD(650));
    expect((await cajon()).bolsillos[0].cantidad).toBe(USD(200));
  });

  it('corregir o borrar un ahorro corrige el saldo', async () => {
    const c = await cajon();
    const primero = c.movimientos.find(
      (m: { tipo: string; monto: number }) =>
        m.tipo === 'ahorro' && m.monto === USD(300),
    );
    await http
      .patch(`/cajon/movimientos/${primero.id}`)
      .set(auth)
      .send({ monto: USD(320), cantidad: USD(240) })
      .expect(200);
    expect(await saldo()).toBe(USD(630));
    expect((await cajon()).bolsillos[0].cantidad).toBe(USD(210));
    // El de "Sin asignar" ya se repartió en parte: borrarlo dejaría el bolsillo en negativo.
    const sinAsignar = c.movimientos.find(
      (m: { tipo: string; monto: number }) =>
        m.tipo === 'ahorro' && m.monto === USD(100),
    );
    await http
      .delete(`/cajon/movimientos/${sinAsignar.id}`)
      .set(auth)
      .expect(409);
    // Borrar el traspaso devuelve todo a su lugar y entonces sí.
    const traspaso = c.movimientos.find(
      (m: { tipo: string }) => m.tipo === 'traspaso',
    );
    await http
      .delete(`/cajon/movimientos/${traspaso.id}`)
      .set(auth)
      .expect(200);
    await http
      .delete(`/cajon/movimientos/${sinAsignar.id}`)
      .set(auth)
      .expect(200);
    expect(await saldo()).toBe(USD(730));
    const despues = await cajon();
    expect(
      despues.bolsillos.map((b: { cantidad: number }) => b.cantidad),
    ).toEqual([USD(160), 0]);
  });

  it('un bolsillo con plata no se borra; vacío, sí', async () => {
    const [dolar, sin] = (await cajon()).bolsillos;
    await http.delete(`/cajon/bolsillos/${dolar.id}`).set(auth).expect(409);
    await http.delete(`/cajon/bolsillos/${sin.id}`).set(auth).expect(200);
    expect((await cajon()).bolsillos).toHaveLength(1);
  });

  it('nadie ve ni toca el cajón de otro', async () => {
    const otro = await cuenta('otro@test.com');
    const [dolar] = (await cajon()).bolsillos;
    const mov = (await cajon()).movimientos[0];
    expect((await http.get('/cajon').set(otro).expect(200)).body).toEqual({
      bolsillos: [],
      movimientos: [],
    });
    await http
      .post(`/cajon/bolsillos/${dolar.id}/ajustar`)
      .set(otro)
      .send({ cantidad: 0 })
      .expect(404);
    await http.delete(`/cajon/movimientos/${mov.id}`).set(otro).expect(404);
    await http
      .post('/cajon/ahorrar')
      .set(otro)
      .send({ monto: USD(1), origen: 'mes', bolsilloId: dolar.id, cantidad: 1 })
      .expect(404);
  });

  it('rechaza datos inválidos', async () => {
    await http
      .post('/cajon/ahorrar')
      .set(auth)
      .send({ monto: 0, origen: 'mes' })
      .expect(400);
    await http
      .post('/cajon/ahorrar')
      .set(auth)
      .send({ monto: 10, origen: 'otro' })
      .expect(400);
    await http
      .post('/cajon/bolsillos')
      .set(auth)
      .send({ nombre: 'BTC', unidad: 'BTC', decimales: 9 })
      .expect(400);
    await http.get('/cajon').expect(401);
  });
});
