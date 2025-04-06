import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PatientService } from './patient.service';
import { GetPatientsDto } from './dto/get-patient.dto';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';

@Controller('patient')
@ApiTags('Patient')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post('upload')
  @ApiOperation({ summary: '엑셀 파일 업로드' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'File to upload',
    required: true,
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: '파일 업로드 성공' })
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, callback) => {
        const allowedMimeTypes = [
          'application/vnd.ms-excel', // .xls
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              '엑셀 파일(xls, xlsx)만 업로드 가능합니다.',
            ),
            false,
          );
        }

        return callback(null, true);
      },
      limits: { fileSize: 1024 * 1024 * 5 }, // 5MB 제한
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return await this.patientService.processExcelFile(file);
  }

  @Get('list')
  @ApiOperation({ summary: '환자 목록 조회' })
  @ApiResponse({ status: 200, description: '환자 목록 조회 성공' })
  async getPatientList(@Query() dto: GetPatientsDto) {
    return await this.patientService.getPatients(dto);
  }
}
