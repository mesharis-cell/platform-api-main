class CustomizedError extends Error {
    statusCode: number;
    data?: Record<string, unknown>;

    constructor(statusCode: number, message: string, data?: Record<string, unknown> | string) {
        super(message);
        this.statusCode = statusCode;

        // Third arg is either a structured data payload (propagated to the
        // response body so the client can drive conditional UI like the
        // pooled settlement modal), or a pre-baked stack string (legacy
        // form). Anything else falls through to Error.captureStackTrace.
        if (typeof data === "string" && data.length > 0) {
            this.stack = data;
        } else if (data && typeof data === "object") {
            this.data = data;
            Error.captureStackTrace(this, this.constructor);
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export default CustomizedError;
