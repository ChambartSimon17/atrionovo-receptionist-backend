import assistantController from "./assistant.controller.js";

export default async function assistantRoutes(
  fastify
) {
  fastify.get(
    "/caller-profile",
    assistantController.getCallerProfile
  );
}