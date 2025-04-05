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
    // 11자리 (01000000000) 또는 13자리 (010-0000-0000) 형식만 허용
    if (digits.length === 11 && digits.startsWith('010')) {
      return digits;
    }
    if (phone.length === 13 && phone.match(/^010-\d{4}-\d{4}$/)) {
      return phone;
    }
    return '';
  }

  private normalizeRegistrationNumber(number: string | undefined): string {
    if (!number) return '';
    const cleaned = number.trim();

    // 6자리 (900101)
    if (/^\d{6}$/.test(cleaned)) return cleaned;

    // 7자리 (9001011)
    if (/^\d{7}$/.test(cleaned) && ['1', '2', '3', '4'].includes(cleaned[6]))
      return cleaned;

    // 8자리 (900101-1)
    if (/^\d{6}-[1-4]$/.test(cleaned)) return cleaned;

    // 9자리 이상 (900101-1111111 또는 900101-1*****)
    if (/^\d{6}-[1-4][\d*]{6,}$/.test(cleaned)) return cleaned;

    return '';
  }

  private validatePatient(patient: Partial<Patient>): boolean {
    // name이 없거나 빈 문자열이면 false
    if (!patient.name || !patient.name.trim()) return false;

    const validations = [
      // 이름: 1자 이상 255자 이하
      patient.name.trim().length >= 1 && patient.name.trim().length <= 255,

      // 전화번호: 11자리 (01000000000) 또는 13자리 (010-0000-0000) 형식
      !!this.normalizePhone(patient.phoneNumber),

      // 주민등록번호: 6자리, 7자리, 8자리, 9자리 이상 형식
      !patient.registrationNumber ||
        !!this.normalizeRegistrationNumber(patient.registrationNumber),

      // 차트번호: 255자 이하
      !patient.chartNumber ||
        (typeof patient.chartNumber === 'string' &&
          patient.chartNumber.length <= 255),

      // 주소: 255자 이하
      !patient.address ||
        (typeof patient.address === 'string' && patient.address.length <= 255),

      // 메모: 255자 이하
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

  // private getPatientKey(patient: Patient): string {
  //   // 차트번호가 있으면 [이름, 전화번호, 차트번호]를 키로 사용
  //   if (patient.chartNumber) {
  //     return `${patient.name}|${patient.phoneNumber}|${patient.chartNumber}`;
  //   }
  //   // 차트번호가 없으면 [이름, 전화번호]를 키로 사용
  //   return `${patient.name}|${patient.phoneNumber}`;
  // }

  private mergePatientData(patients: Patient[]): Patient[] {
    const result: Patient[] = [];

    // 아래에서 위로 병합을 위해 역순으로 처리
    for (let i = patients.length - 1; i >= 0; i--) {
      const currentPatient = patients[i];

      // console.log(
      //   `Processing patient: ${currentPatient.chartNumber || 'No Chart'} - ${currentPatient.name}`,
      // );

      // 이미 처리된 환자인지 확인
      const existingIndex = result.findIndex(
        (p) =>
          p.name === currentPatient.name &&
          p.phoneNumber === currentPatient.phoneNumber &&
          // 차트번호가 있는 경우 완전히 일치해야 함
          ((currentPatient.chartNumber &&
            p.chartNumber === currentPatient.chartNumber) ||
            // 차트번호가 없는 경우 이름과 전화번호만 일치하면 됨
            !currentPatient.chartNumber),
      );

      if (existingIndex !== -1) {
        console.log(
          `Merging with existing patient: ${result[existingIndex].chartNumber || 'No Chart'} - ${result[existingIndex].name}`,
        );
        // 이미 존재하는 환자와 병합
        result[existingIndex] = this.mergePatients(
          result[existingIndex],
          currentPatient,
        );
      } else {
        // console.log(
        //   `Adding new patient: ${currentPatient.chartNumber || 'No Chart'} - ${currentPatient.name}`,
        // );
        // 새로운 환자 추가
        result.push(currentPatient);
      }
    }

    // 차트번호 순으로 정렬
    return result.sort((a, b) => {
      if (!a.chartNumber && !b.chartNumber) return 0;
      if (!a.chartNumber) return 1;
      if (!b.chartNumber) return -1;
      return a.chartNumber.localeCompare(b.chartNumber);
    });
  }

  private mergePatients(existing: Patient, newPatient: Patient): Patient {
    return {
      id: existing.id,
      // 차트번호는 기존 값 유지 (비어있지 않은 경우)
      chartNumber: existing.chartNumber || newPatient.chartNumber,

      // 이름과 전화번호는 식별자이므로 변경되지 않음
      name: existing.name,
      phoneNumber: existing.phoneNumber,

      // 아래에서 위로 병합하므로 기존 값이 우선
      registrationNumber:
        existing.registrationNumber || newPatient.registrationNumber,
      address: existing.address || newPatient.address,
      memo: existing.memo || newPatient.memo,
    };
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    // 하이픈과 공백 제거
    return phoneNumber.replace(/[-\s]/g, '');
  }

  async processExcelFile(file: Express.Multer.File) {
    const workbook = XLSX.read(file.buffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const errors: Array<{ row: number; reason: string }> = [];
    const patients: Patient[] = [];

    for (let i = 0; i < data.length; i++) {
      try {
        const row = data[i] as ExcelRow;
        const mappedPatient = this.mapRowToPatient(row);

        if (!this.validatePatient(mappedPatient)) {
          errors.push({ row: i + 1, reason: 'Invalid data format' });
          continue;
        }

        const patient = mappedPatient as Patient;
        patients.push(patient);
      } catch (error) {
        errors.push({
          row: i + 1,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 환자 데이터 병합
    const mergedPatients = this.mergePatientData(patients);

    // 전화번호 정규화
    for (const patient of mergedPatients) {
      patient.phoneNumber = this.normalizePhoneNumber(patient.phoneNumber);
    }

    try {
      await this.patientRepository.clear();

      if (mergedPatients.length > 0) {
        await this.patientRepository.save(mergedPatients);
      }

      return {
        totalRows: data.length,
        processedRows: mergedPatients.length,
        skippedRows: data.length - mergedPatients.length,
        errors,
        patients: mergedPatients,
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
