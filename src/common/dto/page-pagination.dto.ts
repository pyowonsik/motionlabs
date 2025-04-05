import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';

export class PagePaginationDto {
  @IsInt()
  @IsOptional()
  @ApiProperty({ description: '페이지 번호', default: 1 })
  page: number = 1;

  @IsInt()
  @IsOptional()
  @ApiProperty({ description: '페이지 당 데이터 개수', default: 10 })
  take: number = 10;
}
