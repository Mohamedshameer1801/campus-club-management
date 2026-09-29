export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (m: string, code?: string) => new HttpError(400, m, code);
export const unauthorized = (m = "Authentication required") => new HttpError(401, m, "UNAUTHENTICATED");
export const forbidden = (m = "You do not have permission to perform this action") => new HttpError(403, m, "FORBIDDEN");
export const notFound = (m = "Resource not found") => new HttpError(404, m, "NOT_FOUND");
export const conflict = (m: string, code?: string) => new HttpError(409, m, code);
export const unprocessable = (m: string, code?: string) => new HttpError(422, m, code);
