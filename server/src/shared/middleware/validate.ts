import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

import { AppError } from '../utils/app-error';

interface RequestSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Request['params'];
      }

      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as Request['query'];
      }

      next();
    } catch (error: unknown) {
      next(new AppError(400, 'Validation failed.', error));
    }
  };
}
