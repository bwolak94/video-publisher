import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { CreateModelPricingDto } from "./dto/create-model-pricing.dto";
import { UpdateModelPricingDto } from "./dto/update-model-pricing.dto";
import { ModelPricingService } from "./model-pricing.service";

@Controller("model-pricing")
export class ModelPricingController {
  constructor(private readonly service: ModelPricingService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateModelPricingDto) {
    return this.service.create(dto);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateModelPricingDto) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  deactivate(@Param("id") id: string) {
    return this.service.deactivate(id);
  }
}
