import { z } from "zod";

export const createCustomerSchema = z.object({
  restaurantId: z.string().min(1),

  firstName: z.string().min(1),

  lastName: z.string().min(1),

  phoneNumber: z.string().min(1),

  email: z.email().optional(),

  notes: z.string().optional(),

  isVip: z.boolean().optional(),
});

export const findCustomerSchema = z.object({
  restaurantId: z.string().min(1),

  phoneNumber: z.string().min(1),
});