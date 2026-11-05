import { isIP } from "node:net";
export function networkPrefix(value: string | null): string | null {
  if (!value || value.length > 64 || !isIP(value)) return null;
  if (isIP(value) === 4) return value;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const [left, right = ""] = canonical.split("::"), a = left ? left.split(":") : [], b = right ? right.split(":") : [];
  const groups = [...a, ...Array(8 - a.length - b.length).fill("0"), ...b].map(v => Number.parseInt(v, 16));
  if (groups.slice(0, 5).every(v => v === 0) && groups[5] === 65535) return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
  return groups.slice(0, 4).map(v => v.toString(16)).join(":") + "::/64";
}
