/**
 * Character Bible service.
 *
 * Manages characters and their reference images.  Images are uploaded to S3
 * under the `characters/{characterId}/{uuid}.{ext}` key path.  Soft-delete is
 * used for characters (GDPR Art. 17 cascade must also delete S3 + Qdrant assets
 * when a hard-delete pipeline is wired up).
 */

import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, isNull, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import pino from 'pino';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { characters, characterImages } from '../db/schema';
import type { Character, CharacterImage } from '../db/schema';
import { S3Service } from '../storage/s3.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';

const logger = pino({ level: 'info' });

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGES_PER_CHARACTER = 4;

export interface UploadImageDto {
  /** Base64-encoded file content. */
  fileBase64: string;
  /** MIME type of the image (image/jpeg | image/png | image/webp). */
  mimeType: string;
  /** Original filename — used only to derive extension; never executed. */
  filename: string;
}

export interface CharacterWithImages extends Character {
  images: (CharacterImage & { presignedUrl: string })[];
}

@Injectable()
export class CharactersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly s3: S3Service,
  ) {}

  async create(dto: CreateCharacterDto): Promise<Character> {
    const rows = await this.db
      .insert(characters)
      .values({
        name: dto.name,
        description: dto.description,
        style: dto.style ?? 'realistic',
        voiceId: dto.voiceId ?? null,
        nicheProfileId: dto.nicheProfileId ?? null,
        consentType: dto.consentType ?? 'original',
      } as any)
      .returning();
    logger.info({ id: rows[0].id, name: dto.name }, 'Character created');
    return rows[0];
  }

  /** Returns all non-deleted characters with their images (presigned URLs injected). */
  async findAll(): Promise<CharacterWithImages[]> {
    const chars = await this.db
      .select()
      .from(characters)
      .where(isNull(characters.deletedAt));

    const result: CharacterWithImages[] = [];
    for (const char of chars) {
      const images = await this._imagesWithPresigned(char.id);
      result.push({ ...char, images });
    }
    return result;
  }

  /** Returns a single character or throws NotFoundException when deleted/missing. */
  async findOne(id: string): Promise<CharacterWithImages> {
    const rows = await this.db
      .select()
      .from(characters)
      .where(and(eq(characters.id, id), isNull(characters.deletedAt)));

    if (!rows[0]) {
      throw new NotFoundException(`Character ${id} not found`);
    }

    const images = await this._imagesWithPresigned(id);
    return { ...rows[0], images };
  }

  async update(id: string, dto: UpdateCharacterDto): Promise<Character> {
    await this.findOne(id); // guard: not deleted

    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined)           updates['name'] = dto.name;
    if (dto.description !== undefined)    updates['description'] = dto.description;
    if (dto.style !== undefined)          updates['style'] = dto.style;
    if (dto.voiceId !== undefined)        updates['voiceId'] = dto.voiceId;
    if (dto.nicheProfileId !== undefined) updates['nicheProfileId'] = dto.nicheProfileId;
    if (dto.consentType !== undefined)    updates['consentType'] = dto.consentType;

    const rows = await this.db
      .update(characters)
      .set(updates as any)
      .where(eq(characters.id, id))
      .returning();

    logger.info({ id }, 'Character updated');
    return rows[0];
  }

  /** Soft-deletes a character by setting deleted_at = now(). */
  async remove(id: string): Promise<void> {
    await this.findOne(id); // guard: not already deleted

    await this.db
      .update(characters)
      .set({ deletedAt: new Date() } as any)
      .where(eq(characters.id, id));

    logger.info({ id }, 'Character soft-deleted');
  }

  /**
   * Uploads a reference image for a character.
   *
   * Validates:
   * - Character exists and is not deleted.
   * - Maximum 4 images per character.
   * - MIME type is allowed (jpeg / png / webp).
   * - File size does not exceed 10 MB.
   *
   * Stores: `characters/{characterId}/{uuid}.{ext}` in S3.
   */
  async uploadImage(characterId: string, upload: UploadImageDto): Promise<CharacterImage> {
    await this.findOne(characterId); // guard

    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(upload.mimeType)) {
      throw new BadRequestException(
        `Unsupported MIME type: ${upload.mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    const buffer = Buffer.from(upload.fileBase64, 'base64');
    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`Image exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`);
    }

    const existing = await this.db
      .select()
      .from(characterImages)
      .where(eq(characterImages.characterId, characterId));

    if (existing.length >= MAX_IMAGES_PER_CHARACTER) {
      throw new BadRequestException(
        `Character already has ${MAX_IMAGES_PER_CHARACTER} images (maximum reached)`,
      );
    }

    const ext = this._extFromMime(upload.mimeType);
    const key = `characters/${characterId}/${randomUUID()}.${ext}`;
    const s3Url = await this.s3.uploadBuffer(key, buffer, upload.mimeType);

    const rows = await this.db
      .insert(characterImages)
      .values({
        characterId,
        s3Url,
        sortOrder: existing.length,
      } as any)
      .returning();

    logger.info({ characterId, imageId: rows[0].id }, 'Character image uploaded');
    return rows[0];
  }

  async removeImage(characterId: string, imageId: string): Promise<void> {
    await this.findOne(characterId); // guard

    const rows = await this.db
      .select()
      .from(characterImages)
      .where(and(eq(characterImages.id, imageId), eq(characterImages.characterId, characterId)));

    if (!rows[0]) {
      throw new NotFoundException(`Image ${imageId} not found for character ${characterId}`);
    }

    await this.db.delete(characterImages).where(eq(characterImages.id, imageId));
    logger.info({ characterId, imageId }, 'Character image removed');
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async _imagesWithPresigned(
    characterId: string,
  ): Promise<(CharacterImage & { presignedUrl: string })[]> {
    const imgs = await this.db
      .select()
      .from(characterImages)
      .where(eq(characterImages.characterId, characterId));

    return Promise.all(
      imgs.map(async (img) => {
        const key = img.s3Url.replace(/^s3:\/\/[^/]+\//, '');
        const presignedUrl = await this.s3.getPresignedUrl(key);
        return { ...img, presignedUrl };
      }),
    );
  }

  private _extFromMime(mime: string): string {
    switch (mime) {
      case 'image/jpeg': return 'jpg';
      case 'image/png':  return 'png';
      case 'image/webp': return 'webp';
      default:           return 'bin';
    }
  }
}
