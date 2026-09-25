// Defaults cuando aún no hay config en DB (mismo rango inicial: 0–4999)
export const MIN_NUMBER = 0;
export const MAX_NUMBER = 4999;
export const TOTAL_NUMBERS = MAX_NUMBER - MIN_NUMBER + 1; // 5000

// Techo duro de seguridad (también enforced en DB)
export const HARD_MIN = 0;
export const HARD_MAX = 99999;

export function totalNumbers(min: number, max: number) {
  return Math.max(0, max - min + 1);
}

export type TicketStatus = "pendiente" | "reservado" | "confirmado" | "cancelado";

export interface Ticket {
  id: string;
  number: number;
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  status: TicketStatus;
  source: string;
  confirmed_by?: string | null;
  created_at?: string;
}

export interface RaffleSettings {
  id: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  prize_image_url: string | null;
  draw_date: string | null;
  ticket_price: number;
  currency: string;
  whatsapp_number: string;
  alias: string | null;
  transfer_holder: string | null;
  transfer_cbu: string | null;
  transfer_bank: string | null;
  min_number: number;
  max_number: number;
}

export interface Promo {
  id: string;
  name: string;
  quantity: number;
  price: number;
  active: boolean;
  sort_order: number;
}

export interface PackOption {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

/** Opciones de compra: 1 número a precio unitario + promos activas */
export function packOptions(unitPrice: number, currency: string, promos: Promo[]): PackOption[] {
  const opts: PackOption[] = [
    { id: "single", name: "1 número", quantity: 1, price: Number(unitPrice) }
  ];
  for (const p of promos.filter((x) => x.active && x.quantity >= 2)) {
    opts.push({ id: p.id, name: p.name, quantity: p.quantity, price: Number(p.price) });
  }
  return opts;
}

export function formatMoney(value: number, currency: string) {
  return `$${Number(value).toLocaleString("es-AR")} ${currency}`;
}

/** WhatsApp para reserva múltiple: lista números + total + datos */
export function whatsappBatchLink(
  adminNumber: string,
  t: { numbers: number[]; packName: string; total: number; currency: string; nombre: string; apellido: string; dni: string; telefono: string }
) {
  const msg =
    `Hola! Quiero participar del sorteo.%0A` +
    `${encodeURIComponent(t.packName)}: ${t.numbers.join(", ")}%0A` +
    `Total: $${Number(t.total).toLocaleString("es-AR")} ${encodeURIComponent(t.currency)}%0A` +
    `Nombre: ${encodeURIComponent(t.nombre)} ${encodeURIComponent(t.apellido)}%0A` +
    `DNI: ${encodeURIComponent(t.dni)}%0A` +
    `Tel: ${encodeURIComponent(t.telefono)}`;
  const clean = adminNumber.replace(/\D/g, "");
  return `https://wa.me/${clean}?text=${msg}`;
}

export function isValidNumber(n: number, min = MIN_NUMBER, max = MAX_NUMBER) {
  return Number.isInteger(n) && n >= min && n <= max;
}

/** Sugerencias: misma terminación (últimos 2 dígitos) + cercanos ±15 */
export function suggestNumbers(wanted: number, taken: Set<number>, min = MIN_NUMBER, max = MAX_NUMBER): number[] {
  const out: number[] = [];
  const push = (n: number) => {
    if (n < min || n > max) return;
    if (n === wanted || taken.has(n)) return;
    if (!out.includes(n)) out.push(n);
  };
  const suffix = String(wanted).slice(-2);
  // Misma terminación: recorre el rango, toma hasta 6
  for (let n = min; n <= max && out.length < 6; n++) {
    if (String(n).endsWith(suffix)) push(n);
  }
  // Cercanos ±15
  for (let d = 1; d <= 15 && out.length < 12; d++) {
    push(wanted - d);
    if (out.length >= 12) break;
    push(wanted + d);
  }
  return out.slice(0, 10);
}

export function whatsappLink(
  adminNumber: string,
  t: { number: number; nombre: string; apellido: string; dni: string; telefono: string }
) {
  const msg =
    `Hola! Quiero participar del sorteo.%0A` +
    `Número elegido: ${t.number}%0A` +
    `Nombre: ${encodeURIComponent(t.nombre)} ${encodeURIComponent(t.apellido)}%0A` +
    `DNI: ${encodeURIComponent(t.dni)}%0A` +
    `Tel: ${encodeURIComponent(t.telefono)}`;
  const clean = adminNumber.replace(/\D/g, "");
  return `https://wa.me/${clean}?text=${msg}`;
}

/** Link para que el admin contacte al cliente por WhatsApp, con mensaje según estado */
export function adminWhatsappLink(t: {
  number: number;
  nombre: string;
  apellido: string;
  telefono: string;
  status: TicketStatus;
}) {
  const clean = t.telefono.replace(/\D/g, "");
  if (!clean) return "#";
  const base = `Hola ${t.nombre}, te escribimos de Tunumero por tu número ${t.number}.`;
  const per: Record<TicketStatus, string> = {
    pendiente: `Hola ${t.nombre}, te escribimos por tu número ${t.number}. Tu pago todavía está pendiente. ¿Necesitás los datos para transferir?`,
    reservado: `${base} Tu reserva está pendiente de pago. ¿Necesitás los datos para transferir?`,
    confirmado: `${base} Te confirmamos que tu pago fue acreditado. ¡Mucha suerte!`,
    cancelado: `${base} Tu reserva fue cancelada y el número quedó liberado. Escribinos si querés elegir otro.`
  };
  return `https://wa.me/${clean}?text=${encodeURIComponent(per[t.status])}`;
}
