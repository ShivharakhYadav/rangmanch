import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class BlockSeatsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  seatRefs!: string[];
}
