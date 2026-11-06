import AppError from "./AppError.js";


class ConflictError extends AppError {
  constructor(
    message = "Conflict detected.",
    code = null
  ) {
    super(message, 409);

    this.code = code;
  }
}

export default ConflictError;
