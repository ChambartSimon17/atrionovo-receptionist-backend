import { lookupClientSchema } from "../validators/crm.validator.js";

export async function lookupClient(request, reply) {
  const result = lookupClientSchema.safeParse(request.body);

  if (!result.success) {
    const error = new Error("Validation failed");
    
    error.statusCode = 400;
    
    error.details = result.error.issues;
    
    throw error;
  }

  const { email } = result.data;

  return {
    success: true,
    message: "Client lookup endpoint reached.",
    client: {
      email,
    },
  };
}