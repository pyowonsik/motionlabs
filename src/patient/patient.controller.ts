import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PatientService } from './patient.service';

@Controller('patient')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
      fileFilter: (req, file, callback) => {
        // 파일 확장자 검사
        const ext = file.originalname.split('.').pop()?.toLowerCase();
        if (ext !== 'xlsx') {
          callback(new Error('Only .xlsx files are allowed'), false);
          return;
        }
        // MIME 타입 검사
        if (
          file.mimetype !==
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ) {
          callback(new Error('Invalid file type'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }), // 50MB
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    // console.log('Received file:', file.originalname);
    return this.patientService.processExcelFile(file);
  }
}
