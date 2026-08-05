import { z } from "zod";

export const callerProfileSchema = z.object({
  restaurantId: z.string().min(1),

  phoneNumber: z.string().min(1),
});