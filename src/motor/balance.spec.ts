import { proyectar, resumenDelMes, restanteReserva, vigente } from './balance';
import { sumarMeses, diasDelMes } from './meses';
import { Datos, Gasto } from './tipos';

const USD = (n: number) => Math.round(n * 100);
// 15 de octubre de 2026: mitad de un mes de 31 días.
const hoy = new Date(2026, 9, 15);

function datos(parcial: Partial<Datos> = {}): Datos {
  return {
    perfil: { saldo: USD(1000), ingresoMensual: null },
    gastos: [],
    estados: [],
    usos: [],
    ...parcial,
  };
}

describe('meses', () => {
  it('suma meses cruzando el año', () => {
    expect(sumarMeses('2026-11', 3)).toBe('2027-02');
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
  });
  it('cuenta los días', () => {
    expect(diasDelMes('2026-10')).toBe(31);
    expect(diasDelMes('2028-02')).toBe(29);
  });
});

describe('vigente', () => {
  const zapatillas: Gasto = {
    id: 'z',
    nombre: 'Zapatillas en cuotas',
    monto: USD(60),
    tipo: 'fijo',
    mesInicio: '2026-06',
    mesFin: '2026-10',
  };
  it('un fijo con vencimiento se ve hasta ese mes', () => {
    expect(vigente(zapatillas, '2026-05')).toBe(false);
    expect(vigente(zapatillas, '2026-08')).toBe(true);
    expect(vigente(zapatillas, '2026-10')).toBe(true);
    expect(vigente(zapatillas, '2026-11')).toBe(false);
  });
  it('un fijo sin vencimiento sigue para siempre', () => {
    expect(vigente({ ...zapatillas, mesFin: null }, '2030-01')).toBe(true);
  });
  it('un puntual vive solo en su mes', () => {
    const cena: Gasto = {
      id: 'c',
      nombre: 'Cena',
      monto: USD(40),
      tipo: 'puntual',
      mesInicio: '2026-10',
    };
    expect(vigente(cena, '2026-10')).toBe(true);
    expect(vigente(cena, '2026-11')).toBe(false);
  });
});

describe('restanteReserva', () => {
  it('proporcional: a mitad de mes queda cerca de la mitad', () => {
    // 31 días, día 15 → quedan 16/31 de 200
    expect(restanteReserva(USD(200), 'proporcional', 0, '2026-10', hoy)).toBe(
      Math.round((USD(200) * 16) / 31),
    );
  });
  it('proporcional: el último día no queda nada', () => {
    expect(
      restanteReserva(
        USD(200),
        'proporcional',
        0,
        '2026-10',
        new Date(2026, 9, 31),
      ),
    ).toBe(0);
  });
  it('manual: resta lo usado y nunca da negativo', () => {
    expect(restanteReserva(USD(200), 'manual', USD(75), '2026-10', hoy)).toBe(
      USD(125),
    );
    expect(restanteReserva(USD(200), 'manual', USD(250), '2026-10', hoy)).toBe(
      0,
    );
  });
  it('en un mes futuro está entera', () => {
    expect(restanteReserva(USD(200), 'proporcional', 0, '2026-11', hoy)).toBe(
      USD(200),
    );
  });
});

describe('proyectar', () => {
  const base = datos({
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
        id: 'z',
        nombre: 'Zapatillas en cuotas',
        monto: USD(60),
        tipo: 'fijo',
        mesInicio: '2026-06',
        mesFin: '2026-11',
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
  });

  it('mes actual: saldo menos lo que falta pagar y lo que queda en reservas', () => {
    const [oct] = proyectar(base, hoy, '2026-10');
    // alquiler pagado (0) + zapatillas 60 + cena 40 + transporte 150 = 250
    expect(oct.ingreso).toBe(0);
    expect(oct.totalPendiente).toBe(USD(250));
    expect(oct.balance).toBe(USD(750));
  });

  it('meses futuros: arrancan con el balance anterior, suman el ingreso y restan todo', () => {
    const [, nov, dic] = proyectar(base, hoy, '2026-12');
    // nov: 750 + 800 - (400 + 60 + 200) = 890
    expect(nov.inicio).toBe(USD(750));
    expect(nov.balance).toBe(USD(890));
    // dic: las zapatillas vencieron en noviembre → 890 + 800 - 600 = 1090
    expect(dic.gastos.map((g) => g.gastoId)).toEqual(['alq', 'tr']);
    expect(dic.balance).toBe(USD(1090));
  });

  it('si el ingreso del mes todavía no se cobró, cuenta como pendiente', () => {
    const sinCobrar = {
      ...base,
      perfil: { ...base.perfil, ingresoCobradoMes: '2026-09' },
    };
    expect(proyectar(sinCobrar, hoy, '2026-10')[0].balance).toBe(USD(1550));
  });

  it('un monto distinto en un mes no cambia los otros meses', () => {
    const conCambio = {
      ...base,
      estados: [
        ...base.estados,
        {
          gastoId: 'alq',
          mes: '2026-11',
          pagado: false,
          montoDelMes: USD(450),
        },
      ],
    };
    const [, nov, dic] = proyectar(conCambio, hoy, '2026-12');
    expect(nov.gastos.find((g) => g.gastoId === 'alq')!.monto).toBe(USD(450));
    expect(dic.gastos.find((g) => g.gastoId === 'alq')!.monto).toBe(USD(400));
  });

  it('pagar un gasto y descontarlo del saldo no mueve el balance', () => {
    const antes = proyectar(base, hoy, '2026-10')[0].balance;
    const despues = proyectar(
      {
        ...base,
        perfil: { ...base.perfil, saldo: base.perfil.saldo - USD(40) },
        estados: [
          ...base.estados,
          { gastoId: 'cena', mes: '2026-10', pagado: true },
        ],
      },
      hoy,
      '2026-10',
    )[0].balance;
    expect(despues).toBe(antes);
  });
});

describe('resumenDelMes', () => {
  it('un mes pasado no se proyecta', () => {
    expect(resumenDelMes(datos(), hoy, '2026-09')).toBeNull();
  });
  it('sin gastos ni ingreso, el balance es el saldo', () => {
    expect(resumenDelMes(datos(), hoy, '2027-03')!.balance).toBe(USD(1000));
  });
});
