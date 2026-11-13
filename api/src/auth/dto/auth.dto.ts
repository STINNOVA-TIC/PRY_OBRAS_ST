import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { PASSWORD_MENSAJE, PASSWORD_REGEX } from '../../common/password.js';

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'email no es válido' })
  email: string;

  @IsString()
  @Length(1, 72)
  password: string;
}

export class CambiarPasswordDto {
  @IsString()
  @Length(1, 72)
  actual: string;

  @Matches(PASSWORD_REGEX, { message: PASSWORD_MENSAJE })
  nueva: string;
}
