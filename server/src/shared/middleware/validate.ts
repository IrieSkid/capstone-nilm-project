import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';

import { AppError } from '../utils/app-error';

interface RequestSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

function createValidationError(error: ZodError, source: keyof RequestSchemas) {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const fieldPath = issue.path.map(String).join('.');

    if (fieldPath && !fieldErrors[fieldPath]) {
      fieldErrors[fieldPath] = issue.message;
    }
  }

  return new AppError(
    400,
    error.issues[0]?.message || 'Validation failed.',
    {
      source,
      fieldErrors,
      issues: error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      })),
    },
  );
}

export function validate(schemas: RequestSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        const parsedBody = schemas.body.safeParse(req.body);

        if (!parsedBody.success) {
          return next(createValidationError(parsedBody.error, 'body'));
        }

        req.body = parsedBody.data;
      }

      if (schemas.params) {
        const parsedParams = schemas.params.safeParse(req.params);

        if (!parsedParams.success) {
          return next(createValidationError(parsedParams.error, 'params'));
        }

        req.params = parsedParams.data as Request['params'];
      }

      if (schemas.query) {
        const parsedQuery = schemas.query.safeParse(req.query);

        if (!parsedQuery.success) {
          return next(createValidationError(parsedQuery.error, 'query'));
        }

        // Express 5 exposes `req.query` as a getter. Keep Zod's parsed/defaulted
        // value in response locals for route handlers instead of assigning it.
        res.locals.validatedQuery = parsedQuery.data;
      }

      next();
    } catch (error: unknown) {
      next(new AppError(400, 'Validation failed.', error));
    }
  };
}
