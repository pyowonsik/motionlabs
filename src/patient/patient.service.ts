import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './entities/patient.entity';
import * as XLSX from 'xlsx';

interface PatientMap {
  [key: string]: Patient; // 차트번호를 키로 사용
}

interface NoChartPatientMap {
  [key: string]: Patient; // 이름|전화번호를 키로 사용
}

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
  ) {}

  private normalizePhone(phone: string | undefined): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('010')
      ? digits
      : digits.length === 10 && digits.startsWith('10')
        ? '0' + digits
        : '';
  }

  private normalizeRegistrationNumber(number: string | undefined): string {
    if (!number) return '';
    const cleaned = number.trim();
    const hyphenMatch = cleaned.match(/^(\d{6})-([1-4])([\d*]{0,6})$/);
    if (hyphenMatch) return cleaned;
    if (/^\d{6}$/.test(cleaned)) return cleaned;
    if (/^\d{7}$/.test(cleaned) && ['1', '2', '3', '4'].includes(cleaned[6]))
      return cleaned;
    return '';
  }

  private validatePatient(patient: Partial<Patient>): boolean {
    // name이 없거나 빈 문자열이면 false
    if (!patient.name || !patient.name.trim()) return false;

    const validations = [
      patient.name.trim().length <= 255,
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

  private mergePatients(
    existing: Patient,
    newPatient: Partial<Patient>,
  ): Patient {
    return {
      ...existing,
      registrationNumber: newPatient.registrationNumber?.trim()
        ? !existing.registrationNumber ||
          newPatient.registrationNumber.replace(/[*]/g, '').length >
            existing.registrationNumber.replace(/[*]/g, '').length
          ? newPatient.registrationNumber.trim()
          : existing.registrationNumber
        : existing.registrationNumber,
      address: newPatient.address?.trim() || existing.address,
      memo: newPatient.memo?.trim() || existing.memo,
    };
  }

  async processExcelFile(file: Express.Multer.File) {
    const workbook = XLSX.read(file.buffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const patientsWithChart: PatientMap = {};
    const patientsNoChart: NoChartPatientMap = {};
    const errors: Array<{ row: number; reason: string }> = [];

    // 모든 데이터를 한 번에 처리
    for (let i = 0; i < data.length; i++) {
      try {
        const row = data[i] as ExcelRow;
        const mappedPatient = this.mapRowToPatient(row);

        if (!this.validatePatient(mappedPatient)) {
          errors.push({ row: i + 1, reason: 'Invalid data format' });
          continue;
        }

        const normalizedPhone = this.normalizePhone(mappedPatient.phoneNumber);
        mappedPatient.phoneNumber = normalizedPhone;

        if (mappedPatient.chartNumber) {
          // 차트번호가 있는 경우
          if (patientsWithChart[mappedPatient.chartNumber]) {
            patientsWithChart[mappedPatient.chartNumber] = this.mergePatients(
              patientsWithChart[mappedPatient.chartNumber],
              mappedPatient,
            );
          } else {
            patientsWithChart[mappedPatient.chartNumber] =
              mappedPatient as Patient;
          }
        } else {
          // 차트번호가 없는 경우
          const key = `${mappedPatient.name}|${normalizedPhone}`;
          if (patientsNoChart[key]) {
            patientsNoChart[key] = this.mergePatients(
              patientsNoChart[key],
              mappedPatient,
            );
          } else {
            patientsNoChart[key] = mappedPatient as Patient;
          }
        }
      } catch (error) {
        errors.push({
          row: i + 1,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const allPatients = [
      ...Object.values(patientsWithChart),
      ...Object.values(patientsNoChart),
    ];

    try {
      await this.patientRepository.clear();

      if (allPatients.length > 0) {
        await this.patientRepository.save(allPatients);
      }

      return {
        totalRows: data.length,
        processedRows: allPatients.length,
        skippedRows: data.length - allPatients.length,
        errors,
        patients: allPatients,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to save patients to database: ${error.message}`,
        );
      }
      throw new Error('Failed to save patients to database: Unknown error');
    }
  }
}
