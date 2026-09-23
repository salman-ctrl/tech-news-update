export class AppError extends Error {
  constructor(message, { code = 'APP_ERROR', cause } = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (cause) this.cause = cause;
  }
}

export class ConfigError extends AppError {
  constructor(message) {
    super(message, { code: 'CONFIG_ERROR' });
  }
}

export class HttpError extends AppError {
  constructor(message, { status, body, retryAfter, cause } = {}) {
    super(message, { code: 'HTTP_ERROR', cause });
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
  }

  get isRetryable() {
    if (this.status === 429) return true;
    if (this.status >= 500) return true;
    return false;
  }
}