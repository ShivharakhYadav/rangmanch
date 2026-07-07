import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';
import { MAX_SEATS_PER_LOCK } from '@ticketing/shared';

export class CreateHoldDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SEATS_PER_LOCK)
  @IsString({ each: true })
  seatRefs!: string[];

  /** Existing hold token to extend/add to; a new one is issued if omitted. */
  @IsOptional()
  @IsString()
  holdToken?: string;
}
