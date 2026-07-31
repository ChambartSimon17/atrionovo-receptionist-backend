import AppError from "./AppError.js";

// ======================================================
// Conflict Error
// ======================================================
//
// Responsibility
// Indicates that a valid request cannot be completed
// because it conflicts with the current state
// of the application.
//
// Examples
// - Restaurant slug already exists
// - Reservation already exists
// - Customer email already exists
// ======================================================

class ConflictError extends AppError {
  constructor(message = "Conflict detected.") {
    super(message, 409);
  }
}

export default ConflictError;