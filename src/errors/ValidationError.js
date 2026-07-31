import AppError from "./AppError.js";

// ======================================================
// Validation Error
// ======================================================
//
// Responsibility
// Represents invalid client input.
//
// Used when the request contains invalid data that
// violates validation or business rules.
//
// Examples
// - Opening time after closing time
// - Invalid email address
// - Negative capacity
// - Overlapping opening periods
// ======================================================

class ValidationError extends AppError {
  constructor(message = "Validation failed.") {
    super(message, 400);
  }
}

export default ValidationError;