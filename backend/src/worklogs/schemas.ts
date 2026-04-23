import { IsString, IsOptional, IsObject, IsEnum, IsNumber,IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export enum RemittanceStatus {
  REMITTED = 'REMITTED',
  UNREMITTED = 'UNREMITTED',
}

// 1. Pour la création d'un record (Worklog, Segment ou Adjustment)
export class CreateRecordDto {
  @ApiProperty({ 
    enum: ['worklog', 'segment', 'adjustment', 'remittance'],
    description: 'The category of the record' 
  })
  @IsEnum(['worklog', 'segment', 'adjustment', 'remittance'])
  type: string;

  @ApiPropertyOptional({ description: 'The ID of the parent record if this is a child' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({
    description: 'The JSON data containing user and financial details',
    example: { user_id: 'usr-123', hours: 8, rate: 75 }
  })
  @IsObject()
  payload: {
    user_id: string;
    hours?: number;
    rate?: number;
    amount?: number;
    status?: string;
    [key: string]: any; // Permet d'autres champs flexibles dans le JSON
  };
}

// 2. Pour filtrer les worklogs dans l'URL
export class WorklogFilterDto {
  @ApiPropertyOptional({ 
    enum: RemittanceStatus, 
    description: 'Filter by remittance status' 
  })
  @IsOptional()
  @IsEnum(RemittanceStatus)
  remittance_status?: RemittanceStatus;

  @ApiPropertyOptional({ description: 'Filter by a specific User ID' })
  @IsOptional()
  @IsString()
  user_id?: string;

  @ApiPropertyOptional({ example: '2025-11-01', description: 'Start of the date range' })
  @IsOptional()
  @IsDateString()
  period_start?: string;

  @ApiPropertyOptional({ example: '2025-11-30', description: 'End of the date range' })
  @IsOptional()
  @IsDateString()
  period_end?: string;
}

// 3. Pour la réponse (ce que l'API renvoie)
export class WorklogResponseDto {
  @ApiProperty({ example: 1 })
  id: number;
  @ApiProperty({ example: 'worklog' })
  type: string;
  @ApiProperty({ example: 600.00 })
  amount: number;
  @ApiProperty({ description: 'Flexible metadata object' })
  payload: any;
  @ApiProperty()
  createdAt: Date;
}