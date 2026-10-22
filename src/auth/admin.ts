/**
 * Cuentas de Fede que pueden prender y apagar premium para probarlo (POST /premium/prueba).
 * Se puede pisar con ADMIN_EMAILS (separados por coma). Además tienen que haber entrado con
 * Google: el registro con contraseña no verifica el email, Google sí.
 */
const ADMINS_PROD = 'federicomarilungo@gmail.com,enanoidestudios@gmail.com';

export function esAdmin(u: { email: string; googleSub?: string | null }): boolean {
  if (!u.googleSub) return false;
  const lista = (process.env.ADMIN_EMAILS ?? ADMINS_PROD)
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes(u.email.toLowerCase());
}
