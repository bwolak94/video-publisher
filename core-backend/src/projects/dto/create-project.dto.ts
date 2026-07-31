import { IsString, IsNotEmpty, IsEnum } from "class-validator";

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(["worker", "creator"])
  mode: "worker" | "creator";
}
