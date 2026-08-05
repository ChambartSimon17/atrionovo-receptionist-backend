import AppError from "./AppError.js";

// ======================================================
// Not Found Error
// ======================================================
//
// Responsibility
// Indicates that the requested resource does not exist.
//
// Examples
// - Restaurant not found
// - Reservation not found
// - Customer not found
// ======================================================

class NotFoundError extends AppError {
  constructor(
    message = "Resource not found.",
    code = null
  ) {
    super(message, 404);

    this.code = code;
  }
}

export default NotFoundError;