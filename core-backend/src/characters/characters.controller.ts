import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CharactersService, UploadImageDto } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';

@UseGuards(AuthGuard)
@Controller('api/characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  /** POST /api/characters — create a new character */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateCharacterDto) {
    return this.charactersService.create(body);
  }

  /** GET /api/characters — list all non-deleted characters with presigned image URLs */
  @Get()
  async findAll() {
    return this.charactersService.findAll();
  }

  /** GET /api/characters/:id — get one character */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.charactersService.findOne(id);
  }

  /** PUT /api/characters/:id — update a character */
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateCharacterDto) {
    return this.charactersService.update(id, body);
  }

  /** DELETE /api/characters/:id — soft-delete a character */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.charactersService.remove(id);
  }

  /**
   * POST /api/characters/:id/images — upload a reference image.
   *
   * Body (JSON): { fileBase64: string, mimeType: string, filename: string }
   *
   * Using JSON base64 rather than multipart because the server runs Fastify
   * without @fastify/multipart.  The client base64-encodes the file before
   * sending.  Max payload: 10 MB decoded (13.4 MB base64-encoded).
   */
  @Post(':id/images')
  @HttpCode(HttpStatus.CREATED)
  async uploadImage(@Param('id') id: string, @Body() body: UploadImageDto) {
    return this.charactersService.uploadImage(id, body);
  }

  /** DELETE /api/characters/:id/images/:imageId — remove a reference image */
  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    await this.charactersService.removeImage(id, imageId);
  }
}
