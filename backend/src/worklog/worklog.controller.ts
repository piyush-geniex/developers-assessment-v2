import {Controller, Get, Query} from '@nestjs/common';
import {WorklogService} from "./worklog.service";
import {GetWorklogsDto} from "./dto/get-worklogs.dto";

@Controller('worklogs')
export class WorklogController {
    constructor(private readonly worklogService: WorklogService) {}

    @Get()
    getWorklogs(@Query() query: GetWorklogsDto) {
        return this.worklogService.getWorklogs(query);
    }
}
