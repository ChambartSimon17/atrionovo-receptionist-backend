export default async function errorHandler(
  error,
  request,
  reply
) {
  request.log.error(error);

  // Invalid request data (zod) is a client error, not a crash.
  if (error.name === "ZodError") {
    return reply.status(400).send({
      success: false,
      message: "Validation failed.",
      code: "VALIDATION_ERROR",
      errors: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const statusCode = error.statusCode || 500;

  return reply.status(statusCode).send({
    success: false,
    message:
      statusCode === 500
        ? "Internal server error"
        : error.message,
    code: error.code || null,
    errors: error.details || [],
  });
}