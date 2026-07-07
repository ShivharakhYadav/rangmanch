import { UserRole } from '../enums';

export interface AuthUserDto {
  id: string;
  phone: string;
  name: string | null;
  role: UserRole;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDto;
}

/** `devCode` is only populated in non-production so local login is frictionless. */
export interface OtpRequestResultDto {
  sent: boolean;
  devCode?: string;
}
