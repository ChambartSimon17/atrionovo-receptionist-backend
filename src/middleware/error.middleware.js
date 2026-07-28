export default async function errorHandler(error, request, reply) {
  request.log.error(error);

  return reply.status(error.statusCode || 500).send({
    success: false,
    message: error.message || "Internal server error",
    errors: error.details || [],
  });
}