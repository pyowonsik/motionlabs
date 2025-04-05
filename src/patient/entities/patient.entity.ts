import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('patient')
export class Patient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, nullable: true })
  chartNumber?: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 11 })
  phoneNumber: string;

  @Column({ length: 14, nullable: true })
  registrationNumber?: string;

  @Column({ length: 255, nullable: true })
  address?: string;

  @Column({ length: 255, nullable: true })
  memo?: string;
}
