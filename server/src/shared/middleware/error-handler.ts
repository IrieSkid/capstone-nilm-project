import { NextFunction, Request, Response } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

import { AppError } from '../utils/app-error';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    message: 'Route not found.',
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof TokenExpiredError) {
    return res.status(401).json({
      message: 'Session expired. Please log in again.',
    });
  }

  if (error instanceof JsonWebTokenError) {
    return res.status(401).json({
      message: 'Invalid access token.',
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      details: error.details ?? null,
    });
  }

  console.error(error);

  return res.status(500).json({
    message: 'Internal server error.',
  });
}
