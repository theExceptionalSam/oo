import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { ValidationException } from '../utils/validation-exception';

@Injectable()
export class CustomValidationPipe implements PipeTransform<unknown> {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (!metadata.metatype || metadata.metatype === Object) return value;
    const obj = plainToInstance(metadata.metatype, value);
    try {
      await validateOrReject(obj as object, { whitelist: true, forbidNonWhitelisted: true });
      return obj;
    } catch (err) {
      throw new ValidationException(err as unknown as Record<string, unknown>[]);
    }
  }
}
