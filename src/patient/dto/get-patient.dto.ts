import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PagePaginationDto } from 'src/common/dto/page-pagination.dto';

export class GetPatientsDto extends PagePaginationDto {
  @IsString()
  @IsOptional()
  @ApiProperty({ description: '환자 이름', required: false })
  name?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: '환자 전화번호', required: false })
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: '환자 차트번호', required: false })
  chartNumber?: string;
}
