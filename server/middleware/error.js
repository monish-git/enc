import { HttpError } from '../utils/errors.js';

export function notFound(_req, res) {
  res.status(404).json({ error: 'NOT FOUND', code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...(err.extra || {}) });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'PAYLOAD TOO LARGE', code: 'TOO_LARGE' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'MALFORMED JSON', code: 'VALIDATION' });
  }
  if (err?.name === 'CastError') {
    return res.status(400).json({ error: 'INVALID IDENTIFIER', code: 'VALIDATION' });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'ALREADY EXISTS', code: 'DUPLICATE' });
  }
  // Log only the message + route, never bodies (they hold ciphertext/credentials).
  console.error(`[ECN] ${req.method} ${req.path} -> ${err?.message || err}`);
  res.status(500).json({ error: 'INTERNAL SYSTEM ERROR', code: 'INTERNAL' });
}
