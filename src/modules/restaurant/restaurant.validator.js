import { z } from "zod";

export const updateRestaurantSchema = z.object({
  name: z.string().min(1),

  maxCapacity: z.number().int().positive(),

  defaultReservationDurationMinutes:
    z.number().int().positive(),

  maxReservationSize:
    z.number().int().positive(),

  arrivalIntervalMinutes:
    z.number().int().positive(),

  timezone: z.string().min(1),

  language: z.string().min(1),
});