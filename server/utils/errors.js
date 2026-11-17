export class HttpError extends Error {
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    this.code = code || null;
    this.extra = extra || null;
  }
}

export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
