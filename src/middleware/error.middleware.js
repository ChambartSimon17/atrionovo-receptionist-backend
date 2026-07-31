export default async function errorHandler(error, request, reply) {
  request.log.error(error);

  const statusCode = error.statusCode || 500;

  return reply.status(statusCode).send({
    success: false,
    message:
      statusCode === 500
        ? "Internal server error"
        : error.message,
    errors: error.details || [],
  });
}