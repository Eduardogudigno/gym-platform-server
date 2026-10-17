import { z } from 'zod';

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional();

export const profileShape = {
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  gender: optionalText(32),
  address: optionalText(255),
  city: optionalText(100),
  emergencyContactName: optionalText(150),
  emergencyContactPhone: optionalText(30),
  emergencyContactRelationship: optionalText(50),
  notes: optionalText(2000),
};

export const moneySchema = z.union([
  z.number().nonnegative().max(9_999_999.99),
  z.string().regex(/^\d+(\.\d{1,2})?$/),
]);

export const optionalBoolean = z.preprocess((value) => {
  if (value === '' || value === undefined || value === null) return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}, z.boolean().optional());
