/**
 * Unit tests for LikenessService.
 *
 * The Drizzle DB is fully mocked — no real infrastructure required.
 * Tests cover the four critical paths specified in the task:
 *
 *  1. createInvitation — returns token as 64-char hex string (32 bytes).
 *  2. getInvitation — throws NotFoundException for unknown token.
 *  3. checkScope — returns allowed:false for revoked consent.
 *  4. revokeConsent — sets deletionScheduledAt ~30 days from now.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { LikenessService } from './likeness.service';
import { DRIZZLE } from '../db/db.module';

const NOW = new Date('2024-06-01T12:00:00Z');
const FUTURE = new Date('2024-06-08T12:00:00Z'); // 7 days later

const MOCK_INVITATION = {
  id: 'inv-uuid-1',
  token: 'a'.repeat(64),
  operator_id: null,
  expires_at: FUTURE.toISOString(),
  used_at: null,
  created_at: NOW.toISOString(),
};

const MOCK_CONSENT = {
  id: 'consent-uuid-1',
  invitation_id: 'inv-uuid-1',
  subject_name: 'John Doe',
  subject_email: 'john@example.com',
  photos_s3_keys: ['s3://bucket/photos/1.jpg', 's3://bucket/photos/2.jpg', 's3://bucket/photos/3.jpg'],
  liveness_s3_key: 's3://bucket/liveness/1.mp4',
  face_match_score: '0.850',
  purpose: 'promotional video',
  channels: ['youtube', 'instagram'],
  topics_allowed: ['sports', 'fitness'],
  voice_consent: false,
  period_until: null,
  proof_hash: 'abc123',
  proof_ip_hash: 'def456',
  proof_at: NOW.toISOString(),
  revoked_at: null,
  deletion_scheduled_at: null,
  version: 1,
  created_at: NOW.toISOString(),
};

function buildDbMock() {
  return {
    execute: jest.fn(),
  };
}

describe('LikenessService', () => {
  let service: LikenessService;
  let db: ReturnType<typeof buildDbMock>;

  beforeEach(async () => {
    db = buildDbMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LikenessService,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    service = module.get<LikenessService>(LikenessService);
  });

  // ── createInvitation ────────────────────────────────────────────────────────

  describe('createInvitation', () => {
    it('returns an invitation with a 64-character hex token', async () => {
      db.execute.mockResolvedValueOnce([MOCK_INVITATION]);

      const result = await service.createInvitation({});

      // Verify DB was called once (INSERT)
      expect(db.execute).toHaveBeenCalledTimes(1);

      // The token passed to DB should be 64 hex chars (32 bytes → hex)
      const callArg = db.execute.mock.calls[0][0];
      // sql template literal — inspect the values array for the token
      const sqlValues: unknown[] = (callArg as any).values ?? [];
      const tokenValue = sqlValues.find(
        (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v),
      );
      expect(tokenValue).toBeDefined();

      expect(result.id).toBe('inv-uuid-1');
    });
  });

  // ── getInvitation ───────────────────────────────────────────────────────────

  describe('getInvitation', () => {
    it('throws NotFoundException when no row is returned', async () => {
      db.execute.mockResolvedValueOnce([]);

      await expect(service.getInvitation('unknown-token')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when invitation is already used', async () => {
      db.execute.mockResolvedValueOnce([{ ...MOCK_INVITATION, used_at: NOW.toISOString() }]);

      await expect(service.getInvitation(MOCK_INVITATION.token)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when invitation is expired', async () => {
      const past = new Date('2020-01-01').toISOString();
      db.execute.mockResolvedValueOnce([{ ...MOCK_INVITATION, expires_at: past }]);

      await expect(service.getInvitation(MOCK_INVITATION.token)).rejects.toThrow(BadRequestException);
    });

    it('returns the invitation when valid', async () => {
      db.execute.mockResolvedValueOnce([MOCK_INVITATION]);

      const result = await service.getInvitation(MOCK_INVITATION.token);

      expect(result.id).toBe('inv-uuid-1');
    });
  });

  // ── checkScope ──────────────────────────────────────────────────────────────

  describe('checkScope', () => {
    it('returns allowed:false with reason when consent is revoked', async () => {
      const revokedConsent = {
        ...MOCK_CONSENT,
        revoked_at: NOW.toISOString(),
      };
      // getConsent → SELECT call
      db.execute.mockResolvedValueOnce([revokedConsent]);

      const result = await service.checkScope('consent-uuid-1', 'sports', 'youtube');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Consent revoked');
    });

    it('returns allowed:false when topic is not in allowed list', async () => {
      db.execute.mockResolvedValueOnce([MOCK_CONSENT]);

      const result = await service.checkScope('consent-uuid-1', 'politics', 'youtube');

      expect(result.allowed).toBe(false);
      expect((result as any).reason).toMatch(/Topic.*not in allowed topics/);
    });

    it('returns allowed:false when channel is not in allowed list', async () => {
      db.execute.mockResolvedValueOnce([MOCK_CONSENT]);

      const result = await service.checkScope('consent-uuid-1', 'sports', 'tiktok');

      expect(result.allowed).toBe(false);
      expect((result as any).reason).toMatch(/Channel.*not in allowed channels/);
    });

    it('returns allowed:true for valid topic and channel', async () => {
      db.execute.mockResolvedValueOnce([MOCK_CONSENT]);

      const result = await service.checkScope('consent-uuid-1', 'sports', 'youtube');

      expect(result.allowed).toBe(true);
    });
  });

  // ── revokeConsent ───────────────────────────────────────────────────────────

  describe('revokeConsent', () => {
    it('sets deletionScheduledAt approximately 30 days from now', async () => {
      // getConsent → SELECT, then UPDATE
      db.execute
        .mockResolvedValueOnce([MOCK_CONSENT])
        .mockResolvedValueOnce([]);

      const result = await service.revokeConsent('consent-uuid-1');

      expect(result.status).toBe('revoked');

      const deletionDate = result.deletionScheduledAt as Date;
      const diffMs = deletionDate.getTime() - Date.now();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // Should be between 29 and 31 days from now
      expect(diffDays).toBeGreaterThan(29);
      expect(diffDays).toBeLessThan(31);
    });

    it('throws BadRequestException when consent is already revoked', async () => {
      const alreadyRevoked = { ...MOCK_CONSENT, revoked_at: NOW.toISOString() };
      db.execute.mockResolvedValueOnce([alreadyRevoked]);

      await expect(service.revokeConsent('consent-uuid-1')).rejects.toThrow(BadRequestException);
    });
  });
});
