import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { AuthTokensDto, AuthUserDto, OtpRequestResultDto } from '@ticketing/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body() dto: RequestOtpDto): Promise<OtpRequestResultDto> {
    return this.auth.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthTokensDto> {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.name);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): Promise<AuthUserDto> {
    return this.auth.me(user.userId);
  }
}
