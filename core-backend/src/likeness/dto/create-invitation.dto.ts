import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';

export class CreateInvitationDto {
  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
