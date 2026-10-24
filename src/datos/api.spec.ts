import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { AppModule } from '../app.module';
import { MonasaferService } from './monasafer.service';
import { VerificadorGoogle } from '../auth/google';
import { Correo } from '../auth/correo';
import { ClienteIa, interpretarHerramienta } from '../premium/asistente';
import { MercadoPago } from '../premium/mercadopago';
import { getModelToken } from '@nestjs/mongoose';
import { Usuario } from './esquemas';

// Prueba la API entera contra un Mongo en memoria. Hoy = 15/10/2026.
jest.setTimeout(60000);
const USD = (n: number) => Math.round(n * 100);

describe('API de Monasafer', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const correos: { para: string; html: string }[] = [];
  let mp: MercadoPago;
  const preapprovals = new Map<string, { id: string; status: string; external_reference?: string; preapproval_plan_id?: string; next_payment_date: string }>();

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
    jest
      .spyOn(mod.get(Correo), 'enviar')
      .mockImplementation(async (para, _asunto, html) => {
        correos.push({ para, html });
        return true;
      });
    // IA falsa: siempre propone la campera en 6 cuotas.
    const ia = mod.get(ClienteIa);
    jest.spyOn(ia, 'configurado').mockReturnValue(true);
    jest.spyOn(ia, 'preguntar').mockImplementation(async () => ({
      id: 'msg', type: 'message', role: 'assistant', model: 'claude-haiku-5-5',
      stop_reason: 'tool_use', stop_sequence: null,
      usage: { input_tokens: 1000, output_tokens: 200 },
      content: [
        { type: 'text', text: '¿La agrego así?' },
        { type: 'tool_use', id: 't1', name: 'crear_gasto', input: {
          nombre: 'Campera', emoji: '🧥', monto_mensual: 50, tipo: 'fijo',
          mes_inicio: '2026-10', cantidad_meses: 6, modo_reserva: null } },
      ],
    }) as never);
    // Mercado Pago falso en memoria.
    mp = mod.get(MercadoPago);
    jest.spyOn(mp, 'configurado').mockReturnValue(true);
    let planes = 0;
    jest.spyOn(mp, 'crearPlan').mockImplementation(async () => {
      const id = `plan-${++planes}`;
      return { id, init_point: `https://mp.test/checkout/${id}` };
    });
    jest.spyOn(mp, 'buscarPorPlan').mockImplementation(async (planId) =>
      [...preapprovals.values()].filter((x) => x.preapproval_plan_id === planId));
    jest.spyOn(mp, 'leer').mockImplementation(async (id) => preapprovals.get(id)!);
    jest.spyOn(mp, 'cancelar').mockImplementation(async (id) => {
      preapprovals.get(id)!.status = 'cancelled';
      return preapprovals.get(id)!;
    });
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
      .set('do-connecting-ip', email) // cada cuenta "desde otra IP", por el límite de registros
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

  it('pasar una reserva a "cargo cada uso" rige desde este mes', async () => {
    const { auth } = await cuenta('reserva-manual@test.com');
    const nafta = (
      await http
        .post('/gastos')
        .set(auth)
        .send({ nombre: 'Nafta', monto: USD(100), tipo: 'reserva', mesInicio: '2026-08', recurrente: true })
        .expect(201)
    ).body;
    const manual = await http.patch(`/gastos/${nafta.id}`).set(auth).send({ modoReserva: 'manual' }).expect(200);
    expect(manual.body).toMatchObject({ modoReserva: 'manual', manualDesde: '2026-10' });
    // Sin usos en agosto y septiembre: siguen contando enteros.
    const h = (await http.get('/historial?meses=2').set(auth).expect(200)).body;
    expect(h.map((m: { total: number }) => m.total)).toEqual([USD(100), USD(100)]);
    const vuelta = await http.patch(`/gastos/${nafta.id}`).set(auth).send({ modoReserva: 'proporcional' }).expect(200);
    expect(vuelta.body.manualDesde).toBeUndefined();
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

  it('recupero de contraseña: link de un solo uso que cierra las otras sesiones', async () => {
    const vieja = await cuenta('olvido@test.com');
    await http
      .post('/auth/olvide')
      .send({ email: 'nadie@test.com' })
      .expect(200);
    expect(correos).toHaveLength(0);
    await http
      .post('/auth/olvide')
      .send({ email: 'OLVIDO@test.com' })
      .expect(200);
    expect(correos).toHaveLength(1);
    expect(correos[0].para).toBe('olvido@test.com');
    const codigo = /#recuperar=([\w-]+)/.exec(correos[0].html)![1];
    await http
      .post('/auth/recuperar')
      .send({ codigo: 'inventado', clave: 'nueva-clave-1' })
      .expect(400);
    await new Promise((r) => setTimeout(r, 1100));
    const r = await http
      .post('/auth/recuperar')
      .send({ codigo, clave: 'nueva-clave-1' })
      .expect(200);
    await http
      .get('/perfil')
      .set({ Authorization: `Bearer ${r.body.token}` })
      .expect(200);
    await http.get('/perfil').set(vieja.auth).expect(401);
    await http
      .post('/auth/recuperar')
      .send({ codigo, clave: 'otra-clave-22' })
      .expect(400);
    await http
      .post('/auth/login')
      .send({ email: 'olvido@test.com', clave: 'nueva-clave-1' })
      .expect(200);
  });

  it('borrar la cuenta se lleva todos sus datos y el token deja de valer', async () => {
    const c = await cuenta('chau@test.com');
    await http
      .post('/gastos')
      .set(c.auth)
      .send({ nombre: 'Luz', monto: 3000, tipo: 'fijo', mesInicio: '2026-10' })
      .expect(201);
    await http
      .delete('/perfil')
      .set(c.auth)
      .send({ confirmacion: 'otro@test.com' })
      .expect(400);
    await http
      .delete('/perfil')
      .set(c.auth)
      .send({ confirmacion: 'CHAU@test.com' })
      .expect(200);
    await http.get('/gastos').set(c.auth).expect(401);
    await http
      .post('/auth/login')
      .send({ email: 'chau@test.com', clave: 'bananas123' })
      .expect(401);
    // se puede volver a crear con el mismo email, vacía
    const otra = await cuenta('chau@test.com');
    const g = await http.get('/gastos').set(otra.auth).expect(200);
    expect(g.body).toHaveLength(0);
  });

  it('límite de intentos de login por email', async () => {
    for (let i = 0; i < 10; i++)
      await http
        .post('/auth/login')
        .send({ email: 'fuerza@test.com', clave: 'x' })
        .expect(401);
    await http
      .post('/auth/login')
      .send({ email: 'fuerza@test.com', clave: 'x' })
      .expect(429);
  });

  it('premium: vistas gratis de métricas y del asistente, después pide suscripción', async () => {
    const c = await cuenta('gratis@test.com');
    const p = await http.get('/perfil').set(c.auth).expect(200);
    expect(p.body.premium.activo).toBe(false);
    expect(p.body.usosGratis).toEqual({ metricas: 3, asistente: 10 });
    for (const quedan of [2, 1, 0]) {
      const r = await http.post('/premium/usar').set(c.auth).send({ funcion: 'metricas' }).expect(200);
      expect(r.body).toMatchObject({ permitido: true, quedan });
    }
    const no = await http.post('/premium/usar').set(c.auth).send({ funcion: 'metricas' }).expect(200);
    expect(no.body.permitido).toBe(false);

    const a = await http.post('/asistente').set(c.auth)
      .send({ mensajes: [{ rol: 'usuario', texto: 'compré una campera en 6 cuotas de 50' }] })
      .expect(200);
    expect(a.body.texto).toBe('¿La agrego así?');
    expect(a.body.propuestas[0]).toMatchObject({ accion: 'crear_gasto', gasto: { monto: 5000, mesFin: '2027-03' } });
    expect(a.body.quedan).toBe(9);
    for (let i = 0; i < 9; i++)
      await http.post('/asistente').set(c.auth).send({ mensajes: [{ rol: 'usuario', texto: 'hola' }] }).expect(200);
    const fin = await http.post('/asistente').set(c.auth).send({ mensajes: [{ rol: 'usuario', texto: 'hola' }] }).expect(200);
    expect(fin.body.requierePremium).toBe(true);
  });

  it('premium de prueba: cualquiera lo prende y lo apaga con el botón 👑', async () => {
    const c = await cuenta('corona@test.com');
    const auth = c.auth;
    await http.post('/premium/prueba').set(auth).send({ activo: 'si' }).expect(400);
    const on = await http.post('/premium/prueba').set(auth).send({ activo: true }).expect(200);
    expect(on.body.premium.activo).toBe(true);
    expect((await http.get('/perfil').set(auth)).body.premium.activo).toBe(true);
    const u = await http.post('/premium/usar').set(auth).send({ funcion: 'metricas' }).expect(200);
    expect(u.body).toMatchObject({ permitido: true, premium: true });

    const off = await http.post('/premium/prueba').set(auth).send({ activo: false }).expect(200);
    expect(off.body).toEqual({
      premium: { activo: false, hasta: null },
      usosGratis: { metricas: 3, asistente: 10 },
    });
    expect((await http.get('/perfil').set(auth)).body.premium.activo).toBe(false);
  });

  it('si no se puede iniciar el cobro, se reinician los usos gratis y nadie queda bloqueado', async () => {
    const c = await cuenta('sinpago@test.com');
    for (let i = 0; i < 3; i++) await http.post('/premium/usar').set(c.auth).send({ funcion: 'metricas' }).expect(200);
    const no = await http.post('/premium/usar').set(c.auth).send({ funcion: 'metricas' }).expect(200);
    expect(no.body.permitido).toBe(false);

    (mp.configurado as jest.Mock).mockReturnValueOnce(false);
    const r = await http.post('/premium/suscribir').set(c.auth).send({}).expect(200);
    expect(r.body).toEqual({ url: null, regalo: true, usosGratis: { metricas: 3, asistente: 10 } });
    const si = await http.post('/premium/usar').set(c.auth).send({ funcion: 'metricas' }).expect(200);
    expect(si.body).toMatchObject({ permitido: true, quedan: 2 });

    // Mercado Pago se cae: lo mismo
    (mp.crearPlan as jest.Mock).mockRejectedValueOnce(new Error('MP 500'));
    const r2 = await http.post('/premium/suscribir').set(c.auth).send({}).expect(200);
    expect(r2.body.regalo).toBe(true);
    const p = await http.get('/perfil').set(c.auth).expect(200);
    expect(p.body.usosGratis.metricas).toBe(3);
  });

  it('suscripción web: Mercado Pago autoriza, la notificación activa premium; borrar la cuenta la cancela', async () => {
    const c = await cuenta('paga@test.com');
    const conf = await http.get('/premium/config').expect(200);
    expect(conf.body).toMatchObject({ pagos: true, asistente: true, precio: { moneda: 'ARS' } });
    const s = await http.post('/premium/suscribir').set(c.auth).send({}).expect(200);
    expect(s.body.url).toMatch(/^https:\/\/mp\.test\/checkout\//);
    const planId = s.body.url.split('/').pop();
    // la persona paga en Mercado Pago con cualquier cuenta: nace una suscripción del plan
    const id = `pre-de-${planId}`;
    preapprovals.set(id, { id, status: 'authorized', preapproval_plan_id: planId, next_payment_date: '2026-11-20T10:00:00.000-03:00' });
    // vuelve a tocar "Suscribirme" (plan nuevo, vacío) y después ni vuelve a la web ni llega
    // la notificación: al leer el perfil el back encuentra la del plan pagado igual
    await http.post('/premium/suscribir').set(c.auth).send({}).expect(200);
    const sync = await http.get('/perfil').set(c.auth).expect(200);
    expect(sync.body.premium.activo).toBe(true);
    await http.post('/pagos/mercadopago').send({ type: 'subscription_preapproval', data: { id } }).expect(200);
    const p = await http.get('/perfil').set(c.auth).expect(200);
    expect(p.body.premium.activo).toBe(true);
    expect(new Date(p.body.premium.hasta).toISOString().slice(0, 10)).toBe('2026-11-23');
    const u = await http.post('/premium/usar').set(c.auth).send({ funcion: 'metricas' }).expect(200);
    expect(u.body).toMatchObject({ permitido: true, premium: true });
    const e = await http.get('/premium').set(c.auth).expect(200);
    expect(e.body.suscripcion.estado).toBe('authorized');

    // una notificación de una suscripción ajena (otra referencia) no activa a nadie
    const otra = await cuenta('colado@test.com');
    preapprovals.set('pre-trucho', { id: 'pre-trucho', status: 'authorized', external_reference: 'otro', next_payment_date: '2027-01-01' });
    await http.post('/pagos/mercadopago').send({ type: 'subscription_preapproval', data: { id: 'pre-trucho' } }).expect(200);
    const po = await http.get('/perfil').set(otra.auth).expect(200);
    expect(po.body.premium.activo).toBe(false);

    // se pierde la notificación de la renovación: al vencer, el back le pregunta a MP
    const usuarios = app.get(getModelToken(Usuario.name));
    await usuarios.updateOne({ email: 'paga@test.com' }, { $set: { premiumHasta: new Date(Date.now() - 1000) } });
    preapprovals.get(id)!.next_payment_date = new Date(Date.now() + 30 * 864e5).toISOString();
    const renovado = await http.get('/perfil').set(c.auth).expect(200);
    expect(renovado.body.premium.activo).toBe(true);
    // con la tarjeta rechazada (próximo cobro ya pasado) no se extiende
    await usuarios.updateOne({ email: 'paga@test.com' }, { $set: { premiumHasta: new Date(Date.now() - 1000) } });
    preapprovals.get(id)!.next_payment_date = new Date(Date.now() - 864e5).toISOString();
    await http.post('/pagos/mercadopago').send({ type: 'subscription_preapproval', data: { id } }).expect(200);
    const vencido = await http.get('/perfil').set(c.auth).expect(200);
    expect(vencido.body.premium.activo).toBe(false);

    await http.delete('/perfil').set(c.auth).send({ confirmacion: 'paga@test.com' }).expect(200);
    expect(mp.cancelar).toHaveBeenCalledWith(id);
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
    // y Deshacer lo trae de vuelta
    await http.post(`/gastos/${tr.id}/restaurar`).set(auth).expect(200);
    expect((await http.get('/gastos').set(auth)).body).toHaveLength(4);

    // Cambiar el monto desde un mes no toca los anteriores
    const editado = (
      await http
        .patch(`/gastos/${tr.id}`)
        .set(auth)
        .send({
          cambiosMonto: [
            { desde: '2026-12', monto: USD(150) },
            { desde: '2026-12', monto: USD(180) },
          ],
        })
        .expect(200)
    ).body;
    expect(editado.cambiosMonto).toEqual([{ desde: '2026-12', monto: USD(180) }]);
    await http
      .patch(`/gastos/${tr.id}`)
      .set(auth)
      .send({ cambiosMonto: [{ desde: 'diciembre', monto: 1 }] })
      .expect(400);
  });

  it('historial: lo gastado en los meses pasados, borrados incluidos hasta que se borraron', async () => {
    const { auth } = await cuenta('historial@test.com');
    const gym = (
      await http
        .post('/gastos')
        .set(auth)
        .send({ nombre: 'Gimnasio', emoji: '🏋️', monto: USD(30), tipo: 'fijo', mesInicio: '2026-08' })
        .expect(201)
    ).body;
    await http
      .post('/gastos')
      .set(auth)
      .send({ nombre: 'Cena', monto: USD(40), tipo: 'puntual', mesInicio: '2026-09' })
      .expect(201);
    const h = (await http.get('/historial?meses=3').set(auth).expect(200)).body;
    expect(h.map((m: { mes: string }) => m.mes)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(h.map((m: { total: number }) => m.total)).toEqual([0, USD(30), USD(70)]);
    expect(h[1].gastos[0]).toMatchObject({ nombre: 'Gimnasio', emoji: '🏋️' });
    // Borrado en octubre: los meses pasados no cambian
    await http.delete(`/gastos/${gym.id}`).set(auth).expect(200);
    const h2 = (await http.get('/historial').set(auth).expect(200)).body;
    expect(h2.map((m: { total: number }) => m.total)).toEqual([0, USD(30), USD(70)]);
    await http.get('/historial?meses=13').set(auth).expect(400);
    await http.get('/historial?meses=0').set(auth).expect(400);
  });

  it('comentarios de mejora: se guardan, avisan por email y se van con la cuenta', async () => {
    const c = await cuenta('ideas@test.com');
    await http.post('/comentarios').send({ texto: 'hola' }).expect(401);
    await http.post('/comentarios').set(c.auth).send({ texto: '  ' }).expect(400);
    await http
      .post('/comentarios')
      .set(c.auth)
      .send({ tipo: 'queja', texto: 'x' })
      .expect(400);
    await http
      .post('/comentarios')
      .set(c.auth)
      .send({ texto: 'x'.repeat(2001) })
      .expect(400);
    const antes = correos.length;
    const r = await http
      .post('/comentarios')
      .set(c.auth)
      .send({ tipo: 'idea', texto: 'Que Mona baile <b>más</b>', pantalla: 'inicio' })
      .expect(201);
    expect(r.body.ok).toBe(true);
    expect(correos.length).toBe(antes + 1);
    expect(correos.at(-1)!.para).toBe('admin@monasafer.com');
    expect(correos.at(-1)!.html).toContain('Que Mona baile &#60;b&#62;más');
    expect(correos.at(-1)!.html).toContain('ideas@test.com');
    const modelo = app.get(getModelToken('Comentario'));
    const guardado = await modelo.findById(r.body.id).lean();
    expect(guardado).toMatchObject({
      email: 'ideas@test.com',
      nombre: 'Fede',
      tipo: 'idea',
      pantalla: 'inicio',
      estado: 'nuevo',
    });
    // tope de 10 por día por persona
    for (let i = 0; i < 9; i++)
      await http.post('/comentarios').set(c.auth).send({ texto: `idea ${i}` }).expect(201);
    await http.post('/comentarios').set(c.auth).send({ texto: 'otra' }).expect(429);
    await http
      .delete('/perfil')
      .set(c.auth)
      .send({ confirmacion: 'ideas@test.com' })
      .expect(200);
    expect(await modelo.countDocuments({ email: 'ideas@test.com' })).toBe(0);
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
    await http.post(`/gastos/${g.id}/restaurar`).set(b.auth).expect(404);
  });

  // Fede, 23/10: le dijo a Mona "compré una hamburguesa de 20 pesos", tocó Agregar y no se
  // cargó: el gasto que propone Mona trae `modoReserva: null` y el alta lo rechazaba.
  it('el gasto que propone Mona se puede crear tal cual', async () => {
    const { auth } = await cuenta('mona@test.com');
    const propuesta = interpretarHerramienta(
      'crear_gasto',
      {
        nombre: 'Hamburguesa',
        emoji: '🍔',
        monto_mensual: 20,
        tipo: 'puntual',
        mes_inicio: '2026-10',
        cantidad_meses: null,
        modo_reserva: null,
      },
      [],
      new Date(2026, 9, 15),
    );
    expect(propuesta?.accion).toBe('crear_gasto');
    const gasto = (propuesta as { gasto: object }).gasto;
    const creado = (
      await http.post('/gastos').set(auth).send(gasto).expect(201)
    ).body;
    expect(creado).toMatchObject({
      nombre: 'Hamburguesa',
      monto: USD(20),
      tipo: 'puntual',
    });
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
