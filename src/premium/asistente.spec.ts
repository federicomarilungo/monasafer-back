import { interpretarHerramienta, mensajesApi, GastoContexto } from './asistente';

const hoy = new Date(2026, 9, 20); // 20/10/2026
const gastos: GastoContexto[] = [
  { id: 'luz', nombre: 'Luz', emoji: '💡', tipo: 'fijo', monto: 3000, mesInicio: '2026-01', mesFin: null, pagadoEsteMes: false },
  { id: 'nafta', nombre: 'Nafta', emoji: '⛽', tipo: 'reserva', monto: 20000, mesInicio: '2026-01', mesFin: null, pagadoEsteMes: false },
  { id: 'prueba', nombre: 'prueba', emoji: '💸', tipo: 'puntual', monto: 1000, mesInicio: '2026-10', mesFin: null, pagadoEsteMes: false },
];

describe('asistente: interpretar lo que propone el modelo', () => {
  it('campera en 6 cuotas de 50 → fijo de octubre a marzo', () => {
    const p = interpretarHerramienta('crear_gasto', {
      nombre: 'Campera', emoji: '🧥', monto_mensual: 50, tipo: 'fijo',
      mes_inicio: '2026-10', cantidad_meses: 6, modo_reserva: null,
    }, gastos, hoy);
    expect(p).toEqual({
      accion: 'crear_gasto',
      gasto: {
        nombre: 'Campera', emoji: '🧥', monto: 5000, tipo: 'fijo',
        mesInicio: '2026-10', mesFin: '2027-03', modoReserva: null, recurrente: false,
      },
    });
  });

  it('fijo de 1 mes pasa a puntual; mes pasado se corre al actual; monto 0 se descarta', () => {
    const p = interpretarHerramienta('crear_gasto', {
      nombre: 'Regalo', emoji: '🎁', monto_mensual: 80.555, tipo: 'fijo',
      mes_inicio: '2026-05', cantidad_meses: 1, modo_reserva: null,
    }, gastos, hoy);
    expect(p).toMatchObject({ gasto: { tipo: 'puntual', mesInicio: '2026-10', mesFin: null, monto: 8056 } });
    expect(interpretarHerramienta('crear_gasto', { nombre: 'X', monto_mensual: 0, tipo: 'fijo' }, gastos, hoy)).toBeNull();
  });

  it('reserva para siempre, manual', () => {
    const p = interpretarHerramienta('crear_gasto', {
      nombre: 'Súper', emoji: '🛒', monto_mensual: 400, tipo: 'reserva',
      mes_inicio: '2026-10', cantidad_meses: null, modo_reserva: 'manual',
    }, gastos, hoy);
    expect(p).toMatchObject({ gasto: { tipo: 'reserva', mesFin: null, modoReserva: 'manual', recurrente: true } });
  });

  it('pagar y usar reserva solo con gastos de la lista y del tipo correcto', () => {
    expect(interpretarHerramienta('pagar_gasto', { gasto_id: 'luz', mes: '2026-10' }, gastos, hoy))
      .toEqual({ accion: 'pagar', gastoId: 'luz', mes: '2026-10', nombre: 'Luz' });
    expect(interpretarHerramienta('pagar_gasto', { gasto_id: 'nafta', mes: '2026-10' }, gastos, hoy)).toBeNull();
    expect(interpretarHerramienta('pagar_gasto', { gasto_id: 'inventado', mes: '2026-10' }, gastos, hoy)).toBeNull();
    expect(interpretarHerramienta('usar_reserva', { gasto_id: 'nafta', monto: 30, nota: 'YPF' }, gastos, hoy))
      .toEqual({ accion: 'usar_reserva', gastoId: 'nafta', monto: 3000, nota: 'YPF', nombre: 'Nafta' });
    expect(interpretarHerramienta('usar_reserva', { gasto_id: 'luz', monto: 30, nota: '' }, gastos, hoy)).toBeNull();
  });

  it('"sacar el gasto prueba de octubre": borrar; editar, monto de un mes y terminar validan el gasto', () => {
    expect(interpretarHerramienta('borrar_gasto', { gasto_id: 'prueba' }, gastos, hoy))
      .toEqual({ accion: 'borrar_gasto', gastoId: 'prueba', nombre: 'prueba' });
    expect(interpretarHerramienta('borrar_gasto', { gasto_id: 'inventado' }, gastos, hoy)).toBeNull();
    expect(interpretarHerramienta('editar_gasto', { gasto_id: 'luz', nombre: null, emoji: null, monto_mensual: 45 }, gastos, hoy))
      .toEqual({ accion: 'editar_gasto', gastoId: 'luz', nombre: 'Luz', cambios: { monto: 4500 } });
    expect(interpretarHerramienta('editar_gasto', { gasto_id: 'luz', nombre: null, emoji: null, monto_mensual: null }, gastos, hoy)).toBeNull();
    // la luz de este mes no se paga; un puntual o un mes pasado no aceptan monto del mes
    expect(interpretarHerramienta('monto_del_mes', { gasto_id: 'luz', mes: '2026-10', monto: 0 }, gastos, hoy))
      .toEqual({ accion: 'monto_del_mes', gastoId: 'luz', mes: '2026-10', monto: 0, nombre: 'Luz' });
    expect(interpretarHerramienta('monto_del_mes', { gasto_id: 'prueba', mes: '2026-10', monto: 5 }, gastos, hoy)).toBeNull();
    expect(interpretarHerramienta('monto_del_mes', { gasto_id: 'luz', mes: '2026-09', monto: 5 }, gastos, hoy)).toBeNull();
    expect(interpretarHerramienta('terminar_gasto', { gasto_id: 'luz', ultimo_mes: '2026-11' }, gastos, hoy))
      .toEqual({ accion: 'terminar_gasto', gastoId: 'luz', mesFin: '2026-11', nombre: 'Luz' });
    expect(interpretarHerramienta('terminar_gasto', { gasto_id: 'prueba', ultimo_mes: '2026-11' }, gastos, hoy)).toBeNull();
  });

  it('saldo e ingreso', () => {
    expect(interpretarHerramienta('cambiar_saldo', { saldo: 1234.5 }, gastos, hoy)).toEqual({ accion: 'cambiar_saldo', saldo: 123450 });
    expect(interpretarHerramienta('cambiar_ingreso', { monto: 900000, dia_cobro: 40 }, gastos, hoy))
      .toEqual({ accion: 'cambiar_ingreso', monto: 90000000, diaCobro: 31 });
    expect(interpretarHerramienta('cambiar_ingreso', { monto: 0, dia_cobro: 5 }, gastos, hoy)).toBeNull();
  });

  it('historial: empieza y termina con el usuario y junta mensajes seguidos', () => {
    expect(mensajesApi([
      { rol: 'mona', texto: '¡Hola!' },
      { rol: 'usuario', texto: 'compré una campera' },
      { rol: 'usuario', texto: 'en 6 cuotas' },
      { rol: 'mona', texto: '¿Cuánto la pagaste?' },
      { rol: 'usuario', texto: '300' },
    ])).toEqual([
      { role: 'user', content: 'compré una campera\nen 6 cuotas' },
      { role: 'assistant', content: '¿Cuánto la pagaste?' },
      { role: 'user', content: '300' },
    ]);
  });

  it('captura del broker: una posición por ticker, con cantidad o con el valor en pesos', () => {
    const p = interpretarHerramienta('cargar_cartera', {
      posiciones: [
        { ticker: 'spy', nombre: 'S&P 500', cantidad: 41, valor_pesos: 859360 },
        { ticker: 'GOOGL', nombre: 'Google', cantidad: null, valor_pesos: 210220.5 },
        { ticker: 'SPY', nombre: 'otra vez', cantidad: 3, valor_pesos: null },
        { ticker: 'no vale', nombre: 'x', cantidad: 1, valor_pesos: null },
        { ticker: 'MELI', nombre: '', cantidad: 2.5, valor_pesos: null },
      ],
    }, gastos, hoy);
    expect(p).toEqual({
      accion: 'cargar_cartera',
      posiciones: [
        { ticker: 'SPY', nombre: 'S&P 500', cantidad: 41, valor: null },
        { ticker: 'GOOGL', nombre: 'Google', cantidad: null, valor: 21022050 },
      ],
    });
    expect(interpretarHerramienta('cargar_cartera', { posiciones: [] }, gastos, hoy)).toBeNull();
  });

  it('la captura va con el último mensaje de la persona', () => {
    const r = mensajesApi([{ rol: 'usuario', texto: 'cargá mi cartera' }], { tipo: 'image/png', datos: 'aGVsbG8=' });
    expect(r).toEqual([{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
        { type: 'text', text: 'cargá mi cartera' },
      ],
    }]);
  });
});
