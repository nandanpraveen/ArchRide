export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** For browser URLs/assets only. next/link and router already apply basePath. */
export function sitePath(path = "/") {
  return `${BASE_PATH}${path}`;
}

