import { IsInt, IsISO8601, IsString, Min } from 'class-validator';

export class CreateShowDto {
  @IsString()
  hallId!: string;

  @IsISO8601()
  startsAt!: string;

  @IsInt()
  @Min(0)
  basePrice!: number; // paise
}
