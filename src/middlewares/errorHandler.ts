import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

const isDuplicateKeyError = (err: unknown): err is { code: number; keyPattern?: Record<string, unknown> } =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  let status = 500;
  let message = "Internal server error";
  let details: unknown;

  if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (isDuplicateKeyError(err)) {
    status = 409;
    const field = Object.keys(err.keyPattern ?? {})[0] ?? "field";
    message = `A record with this ${field} already exists`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = "Validation failed";
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if ((err as { type?: string })?.type === "entity.parse.failed") {
    status = 400;
    message = "Malformed JSON in request body";
  } else if ((err as { type?: string })?.type === "entity.too.large") {
    status = 413;
    message = "Request body too large";
  }

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    success: false,
    message,
    ...(details ? { errors: details } : {}),
    ...(status >= 500 && env.nodeEnv !== "production" && err instanceof Error ? { stack: err.stack } : {}),
  });
};
