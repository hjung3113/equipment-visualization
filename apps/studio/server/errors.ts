export const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly issues?: unknown[]) {
    super(message);
  }
}
export const fail = (status: number, message: string, issues?: unknown[]): never => {
  throw new ApiError(status, message, issues);
};
