import { armarResumen, turnoDe } from './resumen';

describe('resumen semanal', () => {
  it('el turno es el último lunes a las 9 de Argentina', () => {
    // viernes 20/11/2026 18:16 ART → el del lunes 16
    expect(turnoDe(new Date('2026-11-20T21:16:00Z'))).toEqual({
      clave: '2026-11-16',
      desde: new Date('2026-11-16T12:00:00Z'),
    });
    // lunes 23/11 8:59 ART todavía es el del 16; a las 9 ya es el del 23
    expect(turnoDe(new Date('2026-11-23T11:59:00Z')).clave).toBe('2026-11-16');
    expect(turnoDe(new Date('2026-11-23T12:00:00Z')).clave).toBe('2026-11-23');
    // domingo 22/11 23:30 ART (ya lunes en UTC) sigue siendo el del 16
    expect(turnoDe(new Date('2026-11-23T02:30:00Z')).clave).toBe('2026-11-16');
    // cambio de mes y de año
    expect(turnoDe(new Date('2027-01-01T15:00:00Z')).clave).toBe('2026-12-28');
  });

  it('agrupa los pendientes por tipo y marca los de la semana', () => {
    const desde = new Date('2026-11-23T12:00:00Z');
    const r = armarResumen(
      [
        { _id: 'a', tipo: 'pedido', texto: 'Sumar YPFD a CEDEARs', email: 'x@y.com', nombre: 'Ana', createdAt: new Date('2026-11-20T10:00:00Z') },
        { _id: 'b', tipo: 'idea', texto: 'Que <b>baile</b>', email: 'z@y.com', createdAt: new Date('2026-11-01T10:00:00Z') },
      ],
      desde,
    );
    expect(r.total).toBe(2);
    expect(r.deLaSemana).toBe(1);
    expect(r.asunto).toBe('🐒 Resumen semanal: 2 pendientes (1 de esta semana)');
    expect(r.html).toContain('🙋 Pedidos para inversiones (1)');
    expect(r.html).toContain('Sumar YPFD a CEDEARs');
    expect(r.html).toContain('Ana (x@y.com)');
    expect(r.html).toContain('Que &#60;b&#62;baile');
    expect(r.html.indexOf('Pedidos')).toBeLessThan(r.html.indexOf('Ideas'));
    expect(r.html.match(/>nuevo</g)).toHaveLength(1);
  });

  it('sin pendientes avisa que no hay nada', () => {
    const r = armarResumen([], new Date());
    expect(r.asunto).toBe('🐒 Resumen semanal: nada pendiente');
    expect(r.total).toBe(0);
  });
});
