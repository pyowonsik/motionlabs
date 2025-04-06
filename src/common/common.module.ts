import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonService } from './common.service';

@Module({
  imports: [],
  controllers: [],
  providers: [CommonService],
  exports: [CommonService],
})
export class CommonModule {}
