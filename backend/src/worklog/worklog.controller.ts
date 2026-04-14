import { Controller, Get, Query, BadRequestException, NotFoundException } from '@nestjs/common';
import { WorklogService } from './worklog.service';
import { GetWorklogsDto } from './dto/get-worklogs.dto';
import { WorklogResponseDto } from './dto/worklog-response.dto';
import { InvalidRemittanceStatusException, WorklogException } from './worklog.exceptions';

@Controller('worklogs')
export class WorklogController {
  constructor(private readonly worklogService: WorklogService) {}

  /**
   * GET /worklogs
   * Query parameters:
   *   - remittance_status: REMITTED or UNREMITTED (optional)
   *   - user_id: filter by user (optional)
   *   - period_start: ISO date (optional, requires period_end)
   *   - period_end: ISO date (optional, requires period_start)
   *
   * Returns: 200 with array of WorklogResponseDto
   * Returns: 400 if validation fails
   */
  @Get()
  async getWorklogs(@Query() query: GetWorklogsDto): Promise<WorklogResponseDto[]> {
    try {
      return await this.worklogService.getWorklogs({
        remittance_status: query.remittance_status,
        user_id: query.user_id,
        period_start: query.period_start,
        period_end: query.period_end,
      });
    } catch (error) {
      if (error instanceof InvalidRemittanceStatusException) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof WorklogException) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof Error && error.message.includes('Invalid')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
