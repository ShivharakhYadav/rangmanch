import { ArrayMinSize, IsArray, IsString } from 'class-validator';

/**
 * Phase 2 stand-in for the payment-backed booking of Phase 3. Flips held seats
 * to BOOKED in Postgres, exercising the final double-booking guard.
 */
export class ConfirmHoldDto {
  @IsString()
  holdToken!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  seatRefs!: string[];
}
