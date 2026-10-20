/**
 * Suscripciones de Mercado Pago (preapproval) por API HTTP, sin librería. Necesita
 * MP_ACCESS_TOKEN (credenciales de producción de la app de Fede en Mercado Pago).
 * Lo que diga una notificación no se cree: siempre se vuelve a leer la suscripción acá.
 */
export interface PreapprovalMp {
  id: string;
  status: string;
  external_reference?: string;
  next_payment_date?: string;
  init_point?: string;
}

const API = 'https://api.mercadopago.com';

export class MercadoPago {
  configurado(): boolean {
    return !!process.env.MP_ACCESS_TOKEN;
  }

  private async pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    const r = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15000),
    });
    const datos = (await r.json().catch(() => null)) as T & { message?: string };
    if (!r.ok)
      throw new Error(`Mercado Pago ${r.status}: ${datos?.message ?? 'sin detalle'}`);
    return datos;
  }

  crearSuscripcion(p: {
    usuarioId: string;
    emailPago: string;
    monto: number; // en pesos, no centavos: así lo pide Mercado Pago
    volverA: string;
  }) {
    return this.pedir<PreapprovalMp>('POST', '/preapproval', {
      reason: 'Monasafer Premium',
      external_reference: p.usuarioId,
      payer_email: p.emailPago,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: p.monto,
        currency_id: 'ARS',
      },
      back_url: p.volverA,
      status: 'pending',
    });
  }

  leer(id: string) {
    return this.pedir<PreapprovalMp>('GET', `/preapproval/${encodeURIComponent(id)}`);
  }

  /** Un cobro mensual: de ahí sale a qué suscripción pertenece. */
  async suscripcionDePago(id: string): Promise<string | null> {
    const p = await this.pedir<{ preapproval_id?: string }>(
      'GET',
      `/authorized_payments/${encodeURIComponent(id)}`,
    );
    return p.preapproval_id ?? null;
  }

  cancelar(id: string) {
    return this.pedir<PreapprovalMp>('PUT', `/preapproval/${encodeURIComponent(id)}`, {
      status: 'cancelled',
    });
  }
}
