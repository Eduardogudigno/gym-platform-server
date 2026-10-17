import { z } from 'zod';

export interface ListQuery {
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

export function listSchema<T extends z.ZodRawShape>(
  filters: T,
  allowed: readonly string[],
  defaultField: string,
  defaultDir: 'asc' | 'desc' = 'desc',
) {
  return z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      sort: z.string().optional(),
      ...filters,
    })
    .transform((value, ctx) => {
      const raw = value.sort ?? `${defaultField}:${defaultDir}`;
      const [field, dir] = raw.split(':');
      if (!field || !allowed.includes(field) || (dir !== 'asc' && dir !== 'desc')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sort'],
          message: `sort must be <field>:asc|desc and field one of ${allowed.join(', ')}`,
        });
        return z.NEVER;
      }
      const sortDir: 'asc' | 'desc' = dir === 'asc' ? 'asc' : 'desc';
      const { sort: _sort, ...rest } = value;
      return { ...rest, sortBy: field, sortDir };
    });
}

export function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export const optionalUuid = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().uuid().optional(),
);

export const optionalDate = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.date().optional(),
);
