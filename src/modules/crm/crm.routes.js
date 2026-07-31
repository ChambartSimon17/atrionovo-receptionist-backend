import { lookupClient } from "../crm/crm.controller.js";

export default async function crmRoutes(fastify) {
  fastify.post("/crm/lookup", lookupClient);
}