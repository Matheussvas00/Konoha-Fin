// Máscaras de entrada compartilhadas (data brasileira e moeda).

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Data brasileira DD/MM/AAAA enquanto o usuário digita.
export function maskDate(v: string): string {
  const n = v.replace(/\D/g, '').slice(0, 8);
  let out = n.slice(0, 2);
  if (n.length >= 3) out += '/' + n.slice(2, 4);
  if (n.length >= 5) out += '/' + n.slice(4, 8);
  return out;
}

// DD/MM/AAAA -> AAAA-MM-DD (ou null se inválida).
export function brToISO(br: string): string | null {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = +m[1], mm = +m[2];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const dt = new Date(iso + 'T00:00:00');
  if (isNaN(dt.getTime()) || dt.getMonth() + 1 !== mm || dt.getDate() !== dd) return null;
  return iso;
}

// AAAA-MM-DD -> DD/MM/AAAA.
export function isoToBR(iso: string): string {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export function todayBR(): string {
  return isoToBR(todayISO());
}

// Valor em moeda: "1234567" (centavos digitados) -> "12.345,67".
export function maskMoney(v: string): string {
  const digits = v.replace(/\D/g, '');
  if (!digits) return '';
  const value = (parseInt(digits, 10) / 100).toFixed(2);
  const [int, dec] = value.split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

export function parseMoney(v: string): number {
  const digits = v.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) / 100 : 0;
}
