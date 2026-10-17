export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function ok<T>(data: T, meta?: PageMeta): { success: true; data: T; meta?: PageMeta } {
  return meta ? { success: true, data, meta } : { success: true, data };
}

export function fail(
  code: string,
  message: string,
  details?: unknown,
): { success: false; error: { code: string; message: string; details?: unknown } } {
  return details === undefined
    ? { success: false, error: { code, message } }
    : { success: false, error: { code, message, details } };
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}
