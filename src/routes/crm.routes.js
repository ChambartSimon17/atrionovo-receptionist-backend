import { lookupClient } from "../controllers/crm.controller.js";

export default async function crmRoutes(fastify) {
  fastify.post("/crm/lookup", lookupClient);
}