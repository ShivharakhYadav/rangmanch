import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVenueDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsOptional()
  @IsString()
  address?: string;
}
