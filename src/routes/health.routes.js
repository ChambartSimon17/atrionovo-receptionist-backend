export default async function healthRoutes(fastify) {
  fastify.get("/health", async () => {
    return {
      status: "OK",
      uptime: process.uptime(),
    };
  });
}