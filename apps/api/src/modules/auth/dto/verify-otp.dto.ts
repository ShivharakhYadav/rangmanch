import { IsNumberString, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class VerifyOtpDto {
  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Enter a valid Indian mobile number' })
  phone!: string;

  @IsNumberString()
  @Length(6, 6)
  code!: string;

  // Optional display name captured at first login (registration).
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}
