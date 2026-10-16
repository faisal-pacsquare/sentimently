import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
}

export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MaxLength(128) password!: string;
}

export class GoogleDto {
  @IsString() @MaxLength(4096) idToken!: string;
}

export class ForgotDto {
  @IsEmail() @MaxLength(254) email!: string;
}

export class VerifyEmailDto {
  @IsString() @MaxLength(200) token!: string;
}

export class ResetDto {
  @IsString() @MaxLength(200) token!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}
