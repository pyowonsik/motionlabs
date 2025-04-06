import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PagePaginationDto } from './dto/page-pagination.dto';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

@Injectable()
export class CommonService {
  applyPagePaginationParamsToQb<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    dto: PagePaginationDto,
  ) {
    const { take, page } = dto;
    const skip = (page - 1) * take;

    // 3,2  -> (4,5,6) , 1페이지(1,2,3) 스킵
    qb.take(take);
    qb.skip(skip);
  }
}
