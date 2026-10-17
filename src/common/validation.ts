import { z } from 'zod';

export const emailSchema = z.string().trim().email().max(255).transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .regex(/[A-Za-z]/, 'must include a letter')
  .regex(/[0-9]/, 'must include a number');

export const personNameSchema = z.string().trim().min(1).max(100);

export const uuidParam = z.object({ id: z.string().uuid() });
