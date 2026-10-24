import { historial, GastoHistorial } from './historial';

const USD = (n: number) => Math.round(n * 100);

describe('historial', () => {
  const alquiler: GastoHistorial = {
    id: 'a',
    nombre: 'Alquiler',
    emoji: '🏠',
    monto: USD(500),
    tipo: 'fijo',
    mesInicio: '2026-06',
  };
  const super_: GastoHistorial = {
    id: 's',
    nombre: 'Súper',
    emoji: '🛒',
    monto: USD(300),
    tipo: 'reserva',
    modoReserva: 'manual',
    recurrente: true,
    mesInicio: '2026-07',
  };
  const cena: GastoHistorial = {
    id: 'c',
    nombre: 'Cena',
    monto: USD(40),
    tipo: 'puntual',
    mesInicio: '2026-08',
  };

  it('reconstruye los gastos de cada mes pasado, con el monto de ese mes', () => {
    const h = historial(
      {
        gastos: [alquiler, super_, cena],
        estados: [{ gastoId: 'a', mes: '2026-08', pagado: true, montoDelMes: USD(520) }],
        usos: [
          { gastoId: 's', mes: '2026-08', monto: USD(120) },
          { gastoId: 's', mes: '2026-08', monto: USD(90) },
        ],
      },
      '2026-05',
      '2026-09',
    );
    expect(h.map((m) => m.mes)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(h.map((m) => m.total)).toEqual([0, USD(500), USD(500), USD(520 + 210 + 40), USD(500)]);
    // La reserva manual cuenta lo usado; sin usos no aparece.
    expect(h[3].gastos.find((l) => l.gastoId === 's')?.monto).toBe(USD(210));
    expect(h[2].gastos.map((l) => l.gastoId)).toEqual(['a']);
    expect(h[3].gastos[0]).toMatchObject({ emoji: '🏠', pagado: true });
  });

  it('una reserva proporcional se consumió entera; pagada cuenta el monto', () => {
    const nafta: GastoHistorial = { ...super_, id: 'n', modoReserva: 'proporcional' };
    const h = historial(
      {
        gastos: [nafta, super_],
        estados: [{ gastoId: 's', mes: '2026-07', pagado: true }],
        usos: [],
      },
      '2026-07',
      '2026-07',
    );
    expect(h[0].total).toBe(USD(600));
  });

  it('un gasto borrado cuenta hasta antes del borrado, y ese mes solo si se pagó', () => {
    const gym: GastoHistorial = { ...alquiler, id: 'g', monto: USD(30), mesArchivo: '2026-08' };
    const datos = { gastos: [gym], estados: [], usos: [] };
    expect(historial(datos, '2026-07', '2026-09').map((m) => m.total)).toEqual([USD(30), 0, 0]);
    const pagado = { ...datos, estados: [{ gastoId: 'g', mes: '2026-08', pagado: true }] };
    expect(historial(pagado, '2026-07', '2026-09').map((m) => m.total)).toEqual([USD(30), USD(30), 0]);
  });

  it('un gasto editado "de acá en adelante" muestra en cada mes el monto que tenía', () => {
    const tarjeta: GastoHistorial = {
      ...alquiler,
      id: 't',
      monto: USD(300),
      cambiosMonto: [{ desde: '2026-08', monto: USD(200) }],
    };
    const datos = { gastos: [tarjeta], estados: [], usos: [] };
    expect(historial(datos, '2026-07', '2026-08').map((m) => m.total)).toEqual([USD(300), USD(200)]);
  });

  it('una reserva que pasó a manual sigue consumida entera antes de manualDesde', () => {
    const nafta: GastoHistorial = { ...super_, id: 'n', manualDesde: '2026-09' };
    const h = historial(
      { gastos: [nafta], estados: [], usos: [{ gastoId: 'n', mes: '2026-09', monto: USD(70) }] },
      '2026-08',
      '2026-10',
    );
    expect(h.map((m) => m.total)).toEqual([USD(300), USD(70), 0]);
  });

  it('mismos números que el front (src/motor.test.js)', () => {
    const gym: GastoHistorial = { ...alquiler, id: 'g', nombre: 'Gimnasio', monto: USD(30), mesArchivo: '2026-08' };
    const h = historial(
      {
        gastos: [alquiler, super_, cena, gym],
        estados: [{ gastoId: 'a', mes: '2026-08', pagado: true, montoDelMes: USD(520) }],
        usos: [
          { gastoId: 's', mes: '2026-08', monto: USD(120) },
          { gastoId: 's', mes: '2026-08', monto: USD(90) },
        ],
      },
      '2026-05',
      '2026-09',
    );
    expect(h.map((m) => m.total)).toEqual([0, USD(530), USD(530), USD(520 + 210 + 40), USD(500)]);
  });
});
