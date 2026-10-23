import { partirBalance } from './ahorro';
import { proyectar } from './balance';
import { Datos } from './tipos';

const USD = (n: number) => Math.round(n * 100);
const hoy = new Date(2026, 9, 15);

// Mismo caso que el test "balance partido" de monasafer-front (src/motor.test.js).
const base: Datos = {
  perfil: {
    saldo: USD(1000),
    ingresoMensual: { monto: USD(800), diaCobro: 5 },
    ingresoCobradoMes: '2026-10',
  },
  gastos: [
    {
      id: 'alq',
      nombre: 'Alquiler',
      monto: USD(400),
      tipo: 'fijo',
      mesInicio: '2026-01',
    },
    {
      id: 'cena',
      nombre: 'Cena',
      monto: USD(40),
      tipo: 'puntual',
      mesInicio: '2026-10',
    },
    {
      id: 'tr',
      nombre: 'Transporte',
      monto: USD(200),
      tipo: 'reserva',
      mesInicio: '2026-10',
      recurrente: true,
      modoReserva: 'manual',
    },
  ],
  estados: [{ gastoId: 'alq', mes: '2026-10', pagado: true }],
  usos: [{ gastoId: 'tr', mes: '2026-10', monto: USD(50) }],
};

describe('partirBalance', () => {
  it('mes actual: el mes da ingreso menos gastos enteros, el resto viene de antes', () => {
    const [oct] = proyectar(base, hoy, '2026-10');
    // balance: 1000 − (40 + 150) = 810 · del mes: 800 − 640 = 160 · acumulado 650
    expect(partirBalance(base, oct)).toEqual({
      delMes: USD(160),
      acumulado: USD(650),
      total: USD(810),
    });
  });

  it('pagar un gasto no mueve ninguna de las dos partes', () => {
    const pagado: Datos = {
      ...base,
      perfil: { ...base.perfil, saldo: base.perfil.saldo - USD(40) },
      estados: [
        ...base.estados,
        { gastoId: 'cena', mes: '2026-10', pagado: true },
      ],
    };
    const [oct] = proyectar(pagado, hoy, '2026-10');
    expect(partirBalance(pagado, oct)).toEqual(
      partirBalance(base, proyectar(base, hoy, '2026-10')[0]),
    );
  });

  it('una reserva que se pasó cuenta lo usado', () => {
    const pasada: Datos = {
      ...base,
      perfil: { ...base.perfil, saldo: base.perfil.saldo - USD(200) },
      usos: [...base.usos, { gastoId: 'tr', mes: '2026-10', monto: USD(200) }],
    };
    const [oct] = proyectar(pasada, hoy, '2026-10');
    // usado 250 > reservado 200 · del mes: 800 − 690 = 110
    expect(partirBalance(pasada, oct).delMes).toBe(USD(110));
    expect(partirBalance(pasada, oct).acumulado).toBe(USD(650));
  });

  it('ahorrar del mes baja el del mes; del acumulado, el acumulado', () => {
    const ahorrado: Datos = {
      ...base,
      perfil: {
        ...base.perfil,
        saldo: base.perfil.saldo - USD(160) - USD(300),
      },
    };
    const [oct] = proyectar(ahorrado, hoy, '2026-10');
    const p = partirBalance(ahorrado, oct, [
      { mes: '2026-10', monto: USD(160), origen: 'mes' },
      { mes: '2026-10', monto: USD(300), origen: 'acumulado' },
      { mes: '2026-09', monto: USD(999), origen: 'mes' },
    ]);
    expect(p).toEqual({ delMes: 0, acumulado: USD(350), total: USD(350) });
  });

  it('mes futuro: el acumulado es el balance del mes anterior', () => {
    const [oct, nov] = proyectar(base, hoy, '2026-11');
    expect(partirBalance(base, nov)).toEqual({
      delMes: USD(200), // 800 − 400 − 200
      acumulado: oct.balance,
      total: oct.balance + USD(200),
    });
  });

  it('si el saldo es menos de lo que da el mes, todo es del mes y el acumulado queda en 0', () => {
    // Caso real (Fede, 23/10/2026): cobró 5.550.000, no cargó gastos y tiene 495.030.
    const sinCargar: Datos = {
      perfil: {
        saldo: USD(495030),
        ingresoMensual: { monto: USD(5550000), diaCobro: 1 },
        ingresoCobradoMes: '2026-10',
      },
      gastos: [],
      estados: [],
      usos: [],
    };
    const [oct] = proyectar(sinCargar, hoy, '2026-10');
    expect(partirBalance(sinCargar, oct)).toEqual({
      delMes: USD(495030),
      acumulado: 0,
      total: USD(495030),
    });
  });
});
