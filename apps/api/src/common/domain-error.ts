/**
 * Base class for domain rule violations. Carries a stable machine-readable
 * code (envelope `error.code`), a human message, and the HTTP status the
 * global envelope filter should answer with. Use cases throw these;
 * controllers stay thin and never map errors themselves.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
