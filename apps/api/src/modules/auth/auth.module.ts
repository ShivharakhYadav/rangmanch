import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';

@Module({
  // Global so JwtService is injectable by JwtAuthGuard wherever it's used.
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService, OtpService],
})
export class AuthModule {}
