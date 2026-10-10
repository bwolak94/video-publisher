/**
 * Unit tests for CharactersService.
 *
 * The Drizzle DB and S3Service are fully mocked so no real infrastructure is
 * required.  Tests cover the three critical paths called out in the task spec:
 *
 *  1. create — returns a character with an id.
 *  2. findOne — throws NotFoundException for a soft-deleted character.
 *  3. uploadImage — throws BadRequestException for > 4 images or wrong MIME.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CharactersService } from './characters.service';
import { DRIZZLE } from '../db/db.module';
import { S3Service } from '../storage/s3.service';

const MOCK_CHARACTER = {
  id: 'char-uuid-1',
  name: 'Alice',
  description: 'A fictional host character',
  style: 'realistic',
  voiceId: null,
  nicheProfileId: null,
  consentType: 'original',
  likenessConsentId: null,
  version: 1,
  deletedAt: null,
  createdAt: new Date('2024-01-01'),
};

const MOCK_IMAGE = {
  id: 'img-uuid-1',
  characterId: 'char-uuid-1',
  s3Url: 's3://bucket/characters/char-uuid-1/img-uuid-1.png',
  sortOrder: 0,
  createdAt: new Date('2024-01-01'),
};

function buildDbMock() {
  return {
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
  };
}

function buildS3Mock() {
  return {
    uploadBuffer: jest.fn().mockResolvedValue('s3://bucket/characters/char-uuid-1/new.png'),
    getPresignedUrl: jest.fn().mockResolvedValue('https://cdn.example.com/signed'),
  };
}

describe('CharactersService', () => {
  let service: CharactersService;
  let db: ReturnType<typeof buildDbMock>;
  let s3: ReturnType<typeof buildS3Mock>;

  beforeEach(async () => {
    db = buildDbMock();
    s3 = buildS3Mock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharactersService,
        { provide: DRIZZLE, useValue: db },
        { provide: S3Service, useValue: s3 },
      ],
    }).compile();

    service = module.get<CharactersService>(CharactersService);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('returns a character with an id', async () => {
      db.returning.mockResolvedValueOnce([MOCK_CHARACTER]);

      const result = await service.create({
        name: 'Alice',
        description: 'A fictional host character',
      });

      expect(result.id).toBe('char-uuid-1');
      expect(result.name).toBe('Alice');
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('throws NotFoundException when the character is soft-deleted (empty result set)', async () => {
      // Simulate deleted_at being set: drizzle WHERE isNull returns no rows
      db.where.mockResolvedValueOnce([]);

      await expect(service.findOne('char-uuid-1')).rejects.toThrow(NotFoundException);
    });

    it('returns character with images when found', async () => {
      db.where
        .mockResolvedValueOnce([MOCK_CHARACTER])  // findOne select
        .mockResolvedValueOnce([MOCK_IMAGE]);      // images select

      const result = await service.findOne('char-uuid-1');

      expect(result.id).toBe('char-uuid-1');
      expect(result.images).toHaveLength(1);
      expect(result.images[0].presignedUrl).toBe('https://cdn.example.com/signed');
    });
  });

  // ── uploadImage ──────────────────────────────────────────────────────────────

  describe('uploadImage', () => {
    beforeEach(() => {
      // findOne guard: character exists
      db.where
        .mockResolvedValueOnce([MOCK_CHARACTER]) // characters select
        .mockResolvedValueOnce([]);               // images select (for findOne)
    });

    it('throws BadRequestException when MIME type is not allowed', async () => {
      await expect(
        service.uploadImage('char-uuid-1', {
          fileBase64: Buffer.from('fake').toString('base64'),
          mimeType: 'image/gif',
          filename: 'bad.gif',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the character already has 4 images', async () => {
      const fourImages = Array.from({ length: 4 }, (_, i) => ({ ...MOCK_IMAGE, id: `img-${i}` }));

      // Re-mock: findOne calls (characters + images), then image count check
      db.where
        .mockReset()
        .mockResolvedValueOnce([MOCK_CHARACTER]) // findOne: characters
        .mockResolvedValueOnce([])               // findOne: images
        .mockResolvedValueOnce(fourImages);      // uploadImage: existing count check

      await expect(
        service.uploadImage('char-uuid-1', {
          fileBase64: Buffer.from('fake').toString('base64'),
          mimeType: 'image/png',
          filename: 'ok.png',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when file size exceeds 10 MB', async () => {
      const bigBuffer = Buffer.alloc(11 * 1024 * 1024, 0); // 11 MB

      await expect(
        service.uploadImage('char-uuid-1', {
          fileBase64: bigBuffer.toString('base64'),
          mimeType: 'image/png',
          filename: 'big.png',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
