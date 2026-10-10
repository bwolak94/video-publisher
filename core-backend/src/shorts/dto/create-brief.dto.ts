import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsNumber,
  IsIn,
  IsBoolean,
  IsArray,
  IsOptional,
  IsUUID,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateBriefDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  brief: string;

  @IsOptional()
  @IsUUID()
  nicheId: string | null;

  @IsArray()
  @IsOptional()
  characterIds: string[];

  @IsNumber()
  @Type(() => Number)
  budgetUsd: number;

  @IsIn([15, 30, 45])
  @Type(() => Number)
  duration: 15 | 30 | 45;

  @IsIn(["i2v", "v2v", "mix"])
  shotTrack: "i2v" | "v2v" | "mix";

  @IsBoolean()
  hitl: boolean;
}
