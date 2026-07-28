import { lookupClientSchema } from "../validators/crm.validator.js";

export async function lookupClient(request, reply) {
  const result = lookupClientSchema.safeParse(request.body);

  if (!result.success) {
    return reply.status(400).send({
      success: false,
      errors: result.error.issues,
    });
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