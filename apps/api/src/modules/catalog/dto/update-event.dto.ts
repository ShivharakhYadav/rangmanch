import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { EventStatus } from '@ticketing/shared';

/** All fields optional — patch semantics. Cast/sponsor edits are handled separately. */
export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsString()
  posterUrl?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;
}
