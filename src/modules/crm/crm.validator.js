import { z } from "zod";

export const lookupClientSchema = z.object({
  email: z.email(),
});