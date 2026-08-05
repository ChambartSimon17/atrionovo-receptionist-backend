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
  constructor(
    message = "Validation failed.",
    code = null
  ) {
    super(message, 400);

    this.code = code;
  }
}

export default ValidationError;