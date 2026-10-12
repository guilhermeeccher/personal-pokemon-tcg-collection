/** A data local de hoje, `YYYY-MM-DD` — não a UTC, que vira o dia às 21h no Brasil. */
export function hojeLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
