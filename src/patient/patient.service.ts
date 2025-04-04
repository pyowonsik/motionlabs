import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './entities/patient.entity';
import * as XLSX from 'xlsx';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
  ) {}

  private normalizePhone(phone: string | undefined): string {
    if (!phone) return '';

    // 하이픈 포함된 형식인지 확인
    const hasHyphen = phone.includes('-');

    if (hasHyphen) {
      // 정확히 010-xxxx-xxxx 형식인지 정규식 검증
      const pattern = /^010-\d{4}-\d{4}$/;
      if (!pattern.test(phone)) return '';
      return phone.replace(/-/g, ''); // 하이픈 제거 후 리턴
    } else {
      // 하이픈 없을 경우: 숫자만 있고 길이 11 & 010으로 시작
      const onlyDigits = phone.replace(/[^0-9]/g, '');
      if (onlyDigits.length !== 11 || !onlyDigits.startsWith('010')) return '';
      return onlyDigits;
    }
  }

  private normalizeRegistrationNumber(number: string | undefined): string {
    if (!number) return '';

    // 숫자 + * + 하이픈만 허용
    if (!/^[0-9-*]+$/.test(number)) return '';

    // 하이픈 있는 경우
    if (number.includes('-')) {
      // 900101-1 ~ 900101-1234567 또는 900101-1******
      const hyphenPattern = /^(\d{6})-([1-4])([\d*]{0,6})$/;
      const match = number.match(hyphenPattern);
      if (!match) return '';
      return number; // 원본 유지
    } else {
      // 하이픈 없는 경우: 6자리 생년월일 or 7자리(성별 포함)
      if (/^\d{6}$/.test(number)) return number;
      if (/^\d{7}$/.test(number)) {
        const genderDigit = number[6];
        if (!['1', '2', '3', '4'].includes(genderDigit)) return '';
        return number;
      }
      return '';
    }
  }

  private generateIdentifier(patient: Partial<Patient>): string {
    // 차트번호가 있는 경우: [차트번호, 이름, 전화번호]
    // 차트번호가 없는 경우: [이름, 전화번호]
    const parts = [
      patient.chartNumber?.trim(),
      patient.name?.trim(),
      this.normalizePhone(patient.phoneNumber),
    ].filter(Boolean);
    return parts.join('|');
  }

  private validatePatient(patient: Partial<Patient>): boolean {
    // 1. 이름 검증 (1-255자)
    if (
      !patient.name ||
      typeof patient.name !== 'string' ||
      patient.name.trim().length === 0 ||
      patient.name.length > 255
    ) {
      return false;
    }

    // 2. 전화번호 검증 (필수값)
    if (!patient.phoneNumber || !this.normalizePhone(patient.phoneNumber)) {
      return false;
    }

    // 3. 주민등록번호 검증 (있는 경우)
    if (patient.registrationNumber) {
      const normalizedRegNum = this.normalizeRegistrationNumber(
        patient.registrationNumber,
      );
      if (!normalizedRegNum) return false;
    }

    // 4. 차트번호 검증 (있는 경우, 255자 이하)
    if (patient.chartNumber) {
      if (
        typeof patient.chartNumber !== 'string' ||
        patient.chartNumber.length > 255
      ) {
        return false;
      }
    }

    // 5. 주소 검증 (있는 경우, 255자 이하)
    if (patient.address) {
      if (typeof patient.address !== 'string' || patient.address.length > 255) {
        return false;
      }
    }

    // 6. 메모 검증 (있는 경우, 255자 이하)
    if (patient.memo) {
      if (typeof patient.memo !== 'string' || patient.memo.length > 255) {
        return false;
      }
    }

    return true;
  }

  processExcelFile(file: Express.Multer.File) {
    const workbook = XLSX.read(file.buffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const processedPatients = new Map<string, Patient>();
    const errors: Array<{ row: number; reason: string }> = [];

    interface ExcelRow {
      차트번호?: string;
      이름?: string;
      전화번호?: string;
      주민등록번호?: string;
      주소?: string;
      메모?: string;
    }

    // 위에서 아래로 처리하면서 중복 체크 및 병합
    for (let i = 0; i < data.length; i++) {
      try {
        const row = data[i] as ExcelRow;
        const mappedPatient = {
          chartNumber: row.차트번호?.toString(),
          name: row.이름?.toString(),
          phoneNumber: row.전화번호?.toString(),
          registrationNumber: row.주민등록번호?.toString(),
          address: row.주소?.toString(),
          memo: row.메모?.toString(),
        };

        if (!this.validatePatient(mappedPatient)) {
          errors.push({
            row: i + 1,
            reason: 'Invalid data format',
          });
          continue;
        }

        const currentIdentifier = this.generateIdentifier(mappedPatient);
        processedPatients.set(currentIdentifier, mappedPatient as Patient);
      } catch (error) {
        errors.push({
          row: i + 1,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 최종 결과 확인
    console.log('총 행수:', data.length);
    console.log('처리된 데이터:', processedPatients.size);
    console.log('에러:', errors);

    return {
      totalRows: data.length,
      processedRows: processedPatients.size,
      skippedRows: data.length - processedPatients.size,
      errors,
    };
  }
}
