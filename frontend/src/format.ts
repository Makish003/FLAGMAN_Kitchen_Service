export const units: Record<string, string> = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт' };
export const number = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(n);
export const qty = (n: number, unit: string) => `${number(n)} ${units[unit] ?? unit}`;
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();
export const percent = (n: number) => `${new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 1}).format(n)}%`;
export function counted(n:number,one:string,few:string,many:string) {
  const last=n%10,teen=n%100;
  return `${number(n)} ${teen>=11&&teen<=14?many:last===1?one:last>=2&&last<=4?few:many}`;
}
