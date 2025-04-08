import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { Patient } from './entities/patient.entity';
import * as XLSX from 'xlsx';
import { CommonService } from 'src/common/common.service';
import { GetPatientsDto } from './dto/get-patient.dto';

interface ExcelRow {
  차트번호?: string;
  이름?: string;
  전화번호?: string;
  주민등록번호?: string;
  주소?: string;
  메모?: string;
}

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    private commonService: CommonService,
    private connection: Connection,
  ) {}

  // 휴대폰 번호 정규화
  private normalizePhone(phone: string | undefined): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('010')) return digits;
    if (phone.length === 13 && phone.match(/^010-\d{4}-\d{4}$/)) return phone;
    return '';
  }

  // 주민 등록록 번호 정규화
  private normalizeRegistrationNumber(number: string | undefined): string {
    if (!number) return '';
    const cleaned = number.trim();
    if (/^\d{6}$/.test(cleaned)) return cleaned;
    if (/^\d{7}$/.test(cleaned) && ['1', '2', '3', '4'].includes(cleaned[6]))
      return cleaned;
    if (/^\d{6}-[1-4]$/.test(cleaned)) return cleaned;
    if (/^\d{6}-[1-4][\d*]{6,}$/.test(cleaned)) return cleaned;
    return '';
  }

  // 휴대폰 번호 정규화
  private normalizePhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/[-\s]/g, '');
  }

  // 환자 정보 데이터 검증
  private validatePatientInfo(patient: Partial<Patient>): boolean {
    if (!patient.name || !patient.name.trim()) return false;

    const validations = [
      patient.name.trim().length >= 1 && patient.name.trim().length <= 255,
      !!this.normalizePhone(patient.phoneNumber),
      !patient.registrationNumber ||
        !!this.normalizeRegistrationNumber(patient.registrationNumber),
      !patient.chartNumber ||
        (typeof patient.chartNumber === 'string' &&
          patient.chartNumber.length <= 255),
      !patient.address ||
        (typeof patient.address === 'string' && patient.address.length <= 255),
      !patient.memo ||
        (typeof patient.memo === 'string' && patient.memo.length <= 255),
    ];

    return validations.every(Boolean);
  }

  // 비정형 데이터 표준화
  private mapRowToPatient(row: ExcelRow): Partial<Patient> {
    return {
      chartNumber: row.차트번호?.toString().trim() || '',
      name: row.이름?.toString().trim() || '',
      phoneNumber: row.전화번호?.toString().trim() || '',
      registrationNumber: row.주민등록번호?.toString().trim() || '',
      address: row.주소?.toString().trim() || '',
      memo: row.메모?.toString().trim() || '',
    };
  }

  // 중복 환자 병합
  private mergePatientData(patients: Patient[]): Patient[] {
    const mergedMap = new Map<string, Patient>();
    let currentChartNumber = '';
    let prevKey = '';

    for (const patient of patients) {
      const isSamePerson = prevKey === `${patient.name}-${patient.phoneNumber}`;
      const chartNumber =
        patient.chartNumber || (isSamePerson ? currentChartNumber : '');
      const mergeKey = `${chartNumber}-${patient.name}-${patient.phoneNumber}`;

      if (!mergedMap.has(mergeKey)) {
        mergedMap.set(mergeKey, { ...patient, chartNumber });
      } else {
        const existing = mergedMap.get(mergeKey)!;
        mergedMap.set(mergeKey, this.mergePatients(existing, patient));
      }

      if (patient.chartNumber) {
        currentChartNumber = patient.chartNumber;
      }

      prevKey = `${patient.name}-${patient.phoneNumber}`;
    }

    return Array.from(mergedMap.values());
  }

  // 병합데이터 처리
  private mergePatients(existing: Patient, newPatient: Patient): Patient {
    return {
      id: existing.id,
      chartNumber: existing.chartNumber || newPatient.chartNumber,
      name: existing.name,
      phoneNumber: existing.phoneNumber,
      registrationNumber:
        newPatient.registrationNumber || existing.registrationNumber,
      address: newPatient.address || existing.address,
      memo: newPatient.memo || existing.memo,
    };
  }

  // 엑셀 파일 업로드
  async processExcelFile(file: Express.Multer.File) {
    const workbook = XLSX.read(file.buffer, {
      type: 'buffer',
      cellDates: true,
    });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);
    const patients: Patient[] = [];

    for (const row of data as ExcelRow[]) {
      const mappedPatient = this.mapRowToPatient(row);
      if (this.validatePatientInfo(mappedPatient)) {
        patients.push(mappedPatient as Patient);
      }
    }

    try {
      const mergedPatients = this.mergePatientData(patients);

      // 전화번호 포맷 정리
      for (const patient of mergedPatients) {
        patient.phoneNumber = this.normalizePhoneNumber(patient.phoneNumber);
      }

      await this.savePatients(mergedPatients);

      return {
        totalRows: data.length,
        processedRows: mergedPatients.length,
        skippedRows: data.length - mergedPatients.length,
      };
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Failed to save patients to database: ${error.message}`
          : 'Failed to save patients to database: Unknown error',
      );
    }
  }

  private async savePatients(mergedPatients: Patient[]): Promise<void> {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const patientRecords = await queryRunner.manager.find(Patient);

      const newPatients: Patient[] = [];
      const updatePatients: Patient[] = [];

      for (const patient of mergedPatients) {
        const existPatient = patientRecords.find(
          (record) =>
            record.name === patient.name &&
            record.phoneNumber === patient.phoneNumber,
        );

        const isChartNumberExistsInDB = patient.chartNumber
          ? patientRecords.some(
              (record) => record.chartNumber === patient.chartNumber,
            )
          : false;

        if (existPatient) {
          if (!existPatient.chartNumber && patient.chartNumber) {
            existPatient.chartNumber = patient.chartNumber;
          }

          existPatient.registrationNumber = patient.registrationNumber;
          existPatient.address = patient.address;
          existPatient.memo = patient.memo;

          updatePatients.push(existPatient);
        } else if (!patient.chartNumber || !isChartNumberExistsInDB) {
          newPatients.push(patient);
        }
      }

      const updatePromise =
        updatePatients.length > 0
          ? queryRunner.manager.save(updatePatients)
          : Promise.resolve();

      const insertPromise =
        newPatients.length > 0
          ? queryRunner.manager.insert(Patient, newPatients)
          : Promise.resolve();

      await Promise.all([updatePromise, insertPromise]);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getPatients(dto: GetPatientsDto) {
    try {
      const qb = await this.patientRepository
        .createQueryBuilder('patient')
        .select();

      this.commonService.applyPagePaginationParamsToQb(qb, dto);

      if (dto.name) {
        qb.andWhere('patient.name LIKE :name', { name: `%${dto.name}%` });
      }

      if (dto.phoneNumber) {
        qb.andWhere('patient.phoneNumber LIKE :phoneNumber', {
          phoneNumber: `%${dto.phoneNumber}%`,
        });
      }

      if (dto.chartNumber) {
        qb.andWhere('patient.chartNumber LIKE :chartNumber', {
          chartNumber: `%${dto.chartNumber}%`,
        });
      }

      const [patients, total] = await qb.getManyAndCount();

      return {
        total,
        page: dto.page,
        count: patients.length,
        data: patients,
      };
    } catch (error) {
      throw new Error('Failed to retrieve patients. Please try again later.');
    }
  }
}
