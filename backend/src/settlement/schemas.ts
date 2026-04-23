import { IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class GenerateRemittanceDto {
  @ApiProperty({
    description: 'Start date of the settlement period (ISO8601)',
    example: '2025-11-01',
    type: String,
  })
  @IsDateString()
  @IsNotEmpty()
  period_start: string;
 
  @ApiProperty({
    description: 'End date of the settlement period (ISO8601)',
    example: '2025-11-30',
    type: String,
  })
  @IsDateString()
  @IsNotEmpty()
  period_end: string;
}