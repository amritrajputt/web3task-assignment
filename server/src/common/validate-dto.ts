import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from './app-error';

type DtoSource = 'body' | 'query' | 'params';

export function validateDto<T extends ZodType>(
  schema: T,
  source: DtoSource = 'body',
): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      next(new AppError(`Invalid request ${source}`, 400, details));
      return;
    }

    if (source === 'body') {
      req.body = result.data;
    } else {
      res.locals.validatedDto = {
        ...res.locals.validatedDto,
        [source]: result.data,
      };
    }

    next();
  };
}

export function validateBody<T extends ZodType>(schema: T): RequestHandler {
  return validateDto(schema, 'body');
}

export function validateQuery<T extends ZodType>(schema: T): RequestHandler {
  return validateDto(schema, 'query');
}

export function validateParams<T extends ZodType>(schema: T): RequestHandler {
  return validateDto(schema, 'params');
}
