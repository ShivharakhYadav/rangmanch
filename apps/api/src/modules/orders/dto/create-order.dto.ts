import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  showId!: string;

  @IsString()
  holdToken!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  seatRefs!: string[];

  /** Client-generated key so retries don't create duplicate orders. */
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
