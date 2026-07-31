import { lookupClientSchema } from "./crm.validator.js";
import { lookupClientByEmail } from "./crm.service.js";

export async function lookupClient(request) {
  const result = lookupClientSchema.safeParse(request.body);

  if (!result.success) {
    const error = new Error("Validation failed");

    error.statusCode = 400;
    error.details = result.error.issues;

    throw error;
  }

  const { email } = result.data;

  const client = await lookupClientByEmail(email);

  return {
    success: true,
    message: "Client lookup endpoint reached.",
    client,
  };
}