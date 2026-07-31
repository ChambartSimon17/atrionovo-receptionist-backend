// ======================================================
// App Error
// ======================================================
//
// Responsibility
// Base class for all application-specific errors.
//
// Every custom error in the application extends AppError
// to provide a consistent structure for error handling.
//
// Properties
// - message
// - statusCode
// - stack trace
//
// Examples
// - ValidationError (400)
// - NotFoundError (404)
// - ConflictError (409)
// ======================================================

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;