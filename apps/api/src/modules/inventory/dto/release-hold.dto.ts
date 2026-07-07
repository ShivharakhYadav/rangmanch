import { IsArray, IsOptional, IsString } from 'class-validator';

export class ReleaseHoldDto {
  @IsString()
  holdToken!: string;

  /** Specific seats to release; if omitted, the entire hold is released. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seatRefs?: string[];
}
