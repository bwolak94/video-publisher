import { Module } from "@nestjs/common";
import { CreatorController } from "./creator.controller";

@Module({ controllers: [CreatorController] })
export class CreatorModule {}
