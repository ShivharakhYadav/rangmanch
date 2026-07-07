import { IsArray, IsEnum, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EventStatus } from '@ticketing/shared';

class CastInput {
  @IsString()
  role!: string;

  @IsString()
  name!: string;
}

class SponsorInput {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}

export class CreateEventDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @MinLength(2)
  slug!: string;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CastInput)
  cast?: CastInput[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SponsorInput)
  sponsors?: SponsorInput[];
}
