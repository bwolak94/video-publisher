import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn } from 'class-validator';

export class CreateCharacterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  style?: string;

  @IsOptional()
  @IsString()
  voiceId?: string;

  @IsOptional()
  @IsUUID()
  nicheProfileId?: string;

  @IsOptional()
  @IsIn(['original', 'likeness'])
  consentType?: 'original' | 'likeness';
}
