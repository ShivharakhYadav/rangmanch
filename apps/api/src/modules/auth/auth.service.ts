import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import type { AuthTokensDto, AuthUserDto, OtpRequestResultDto, UserRole } from '@ticketing/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpService } from './otp.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  requestOtp(phone: string): Promise<OtpRequestResultDto> {
    return this.otp.request(this.normalize(phone));
  }

  async verifyOtp(phone: string, code: string, name?: string): Promise<AuthTokensDto> {
    const normalized = this.normalize(phone);
    const ok = await this.otp.verify(normalized, code);
    if (!ok) throw new UnauthorizedException('Invalid or expired code');

    const user = await this.prisma.user.upsert({
      where: { phone: normalized },
      update: name ? { name } : {},
      create: { phone: normalized, name },
    });
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.issueTokens(user);
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.toDto(user);
  }

  private async issueTokens(user: User): Promise<AuthTokensDto> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, phone: user.phone, role: user.role },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<number>('JWT_ACCESS_TTL') ?? 900,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<number>('JWT_REFRESH_TTL') ?? 1209600,
      },
    );
    return { accessToken, refreshToken, user: this.toDto(user) };
  }

  private toDto(user: User): AuthUserDto {
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role as unknown as UserRole,
    };
  }

  /** Strip a leading +91 so numbers are stored consistently. */
  private normalize(phone: string): string {
    return phone.replace(/^\+91/, '');
  }
}
