import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { SubtitleStylePresetsService, SubtitlePreset } from "./subtitle-style-presets.service";

/**
 * Subtitle style preset CRUD.
 *
 * GET    /api/subtitle-presets          — list all presets (built-in + user)
 * GET    /api/subtitle-presets/:id      — get one preset by id
 * POST   /api/subtitle-presets          — create / update a user preset
 * DELETE /api/subtitle-presets/:id      — delete a user preset (built-ins are immutable)
 */
@Controller("api/subtitle-presets")
export class SubtitlePresetsController {
  constructor(private readonly presets: SubtitleStylePresetsService) {}

  @Get()
  listAll(): Promise<SubtitlePreset[]> {
    return this.presets.listAll();
  }

  @Get(":id")
  async findById(@Param("id") id: string): Promise<SubtitlePreset> {
    const preset = await this.presets.findById(id);
    if (!preset) throw new NotFoundException(`Preset "${id}" not found`);
    return preset;
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async save(
    @Body() body: Omit<SubtitlePreset, "builtIn">,
  ): Promise<SubtitlePreset> {
    if (!body.id || !body.name || !body.style) {
      throw new BadRequestException("id, name, and style are required");
    }
    return this.presets.save(body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    const deleted = await this.presets.delete(id);
    if (!deleted) {
      throw new BadRequestException(`Cannot delete preset "${id}" — it is a built-in preset`);
    }
  }
}
