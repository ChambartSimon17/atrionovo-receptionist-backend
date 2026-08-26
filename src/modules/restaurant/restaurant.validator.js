import { z } from "zod";

export const updateRestaurantSchema = z.object({
  name: z.string().min(1),

  maxCapacity: z.number().int().positive(),

  timezone: z.string().min(1),

  language: z.string().min(1),
});