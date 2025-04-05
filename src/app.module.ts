import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as Joi from 'joi';
import { PatientModule } from './patient/patient.module';
import { envVariableKeys } from './common/\bconst/env.const';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DB_TYPE: Joi.string().valid('mysql').required(),
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().required(),
        DB_USERNAME: Joi.string().required(),
        DB_PASSWORD: Joi.string().required(),
        DB_DATABASE: Joi.string().required(),
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get(envVariableKeys.dbHost),
        port: configService.get(envVariableKeys.dbPort),
        username: configService.get(envVariableKeys.dbUsername),
        password: configService.get(envVariableKeys.dbPassword),
        database: configService.get(envVariableKeys.dbDatabase),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    CommonModule,
    PatientModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
