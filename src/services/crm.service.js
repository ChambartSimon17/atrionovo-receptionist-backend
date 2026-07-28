import { findClientByEmail } from "../repositories/crm.repository.js";

export async function lookupClientByEmail(email) {
  const client = await findClientByEmail(email);

  return client;
}