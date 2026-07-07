import { Matches } from 'class-validator';

export class RequestOtpDto {
  // Indian mobile number, optional +91.
  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Enter a valid Indian mobile number' })
  phone!: string;
}
