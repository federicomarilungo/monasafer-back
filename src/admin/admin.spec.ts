import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminKeyGuard } from './admin.guard';
import { ConsultaInvalida, LIMITE_MAXIMO, validarConsulta } from './consulta';

describe('validarConsulta', () => {
  it('acepta un find con filtro, orden y límite', () => {
    const c = validarConsulta({
      operacion: 'find',
      coleccion: 'gastos',
      filtro: { tipo: 'fijo' },
      orden: { monto: -1 },
      limite: 10,
    });
    expect(c).toMatchObject({
      coleccion: 'gastos',
      filtro: { tipo: 'fijo' },
      limite: 10,
    });
  });
  it('topea el límite', () => {
    expect(
      validarConsulta({ operacion: 'find', coleccion: 'gastos', limite: 99999 })
        .limite,
    ).toBe(LIMITE_MAXIMO);
  });
  it('listar colecciones no pide colección', () => {
    expect(validarConsulta({ operacion: 'colecciones' }).operacion).toBe(
      'colecciones',
    );
  });
  it.each([
    [{ operacion: 'deleteMany', coleccion: 'gastos' }],
    [{ operacion: 'find' }],
    [{ operacion: 'find', coleccion: 'system.users' }],
    [
      {
        operacion: 'aggregate',
        coleccion: 'gastos',
        pipeline: [{ $match: {} }, { $out: 'copia' }],
      },
    ],
    [
      {
        operacion: 'aggregate',
        coleccion: 'gastos',
        pipeline: [{ $merge: { into: 'x' } }],
      },
    ],
    [
      {
        operacion: 'find',
        coleccion: 'gastos',
        filtro: { $where: 'sleep(1000)' },
      },
    ],
    [
      {
        operacion: 'aggregate',
        coleccion: 'gastos',
        pipeline: [{ $project: { x: { $function: { body: '1' } } } }],
      },
    ],
    [{ operacion: 'find', coleccion: 'gastos', orden: { monto: 'desc' } }],
  ])('rechaza %j', (body) => {
    expect(() => validarConsulta(body)).toThrow(ConsultaInvalida);
  });
});

describe('AdminKeyGuard', () => {
  const ctx = (headers: Record<string, string>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as unknown as ExecutionContext;
  const guard = new AdminKeyGuard();
  const clave = 'x'.repeat(32);
  afterEach(() => delete process.env.ADMIN_API_KEY);

  it('sin ADMIN_API_KEY el endpoint no anda', () => {
    expect(() => guard.canActivate(ctx({ 'x-admin-key': '' }))).toThrow(
      ServiceUnavailableException,
    );
  });
  it('rechaza una clave equivocada o ausente', () => {
    process.env.ADMIN_API_KEY = clave;
    expect(() => guard.canActivate(ctx({ 'x-admin-key': 'otra' }))).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });
  it('deja pasar la clave correcta', () => {
    process.env.ADMIN_API_KEY = clave;
    expect(guard.canActivate(ctx({ 'x-admin-key': clave }))).toBe(true);
  });
});
