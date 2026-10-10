import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsArray,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class SubmitConsentDto {
  @IsString()
  @IsNotEmpty()
  subjectName!: string;

  @IsEmail()
  subjectEmail!: string;

  @IsString()
  @IsNotEmpty()
  purpose!: string;

  @IsArray()
  @IsString({ each: true })
  channels!: string[];

  @IsArray()
  @IsString({ each: true })
  topicsAllowed!: string[];

  @IsBoolean()
  @IsOptional()
  voiceConsent?: boolean;

  @IsOptional()
  periodUntil?: string; // ISO date string
}
