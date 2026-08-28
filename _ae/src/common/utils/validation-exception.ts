import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  constructor(errors: unknown) {
    super(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          details: errors,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
