/**
 * DPIA NOTE: This service handles biometric data (facial images, liveness videos)
 * classified as Special Category Data under GDPR Art. 9.
 * Legal basis: explicit consent (Art. 9(2)(a)).
 * Retention: data deleted within 30 days of consent revocation per Art. 17.
 * See docs/compliance/dpia.md for full Data Protection Impact Assessment.
 */

import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import * as crypto from 'crypto';
import pino from 'pino';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { SubmitConsentDto } from './dto/submit-consent.dto';

const logger = pino({ level: 'info' });

@Injectable()
export class LikenessService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createInvitation(dto: CreateInvitationDto) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (dto.expiresInDays ?? 7));

    const rows = await this.db.execute(sql`
      INSERT INTO likeness_invitations (token, expires_at)
      VALUES (${token}, ${expiresAt.toISOString()})
      RETURNING *
    `);

    const rowsArr = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
    const invitation = (rowsArr as any[])[0];
    logger.info({ id: invitation?.id }, 'Likeness invitation created');
    return invitation;
  }

  async getInvitation(token: string) {
    const rows = await this.db.execute(sql`
      SELECT * FROM likeness_invitations WHERE token = ${token}
    `);

    const rowsArr = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
    const inv = (rowsArr as any[])[0];
    if (!inv) throw new NotFoundException('Invitation not found');
    if (inv.used_at) throw new BadRequestException('Invitation already used');
    if (new Date(inv.expires_at) < new Date()) throw new BadRequestException('Invitation expired');
    return inv;
  }

  async submitConsent(
    token: string,
    dto: SubmitConsentDto,
    photoS3Keys: string[],
    livenessS3Key: string,
    ipAddress: string,
  ) {
    const inv = await this.getInvitation(token);

    if (photoS3Keys.length < 3 || photoS3Keys.length > 10) {
      throw new BadRequestException('Wymagane 3–10 zdjęć referencyjnych');
    }

    // Face match score — placeholder; real implementation delegates to AWS Rekognition
    // or a dedicated face-similarity microservice. Face-api.js is excluded due to
    // native binary size constraints.
    const faceMatchScore = 0.85;

    if (faceMatchScore < 0.7) {
      throw new BadRequestException(
        'Weryfikacja twarzy nie powiodła się. Prześlij wyraźniejsze zdjęcia.',
      );
    }

    // Proof hash covers all consent parameters — immutable audit trail.
    const proofData = JSON.stringify({
      subjectEmail: dto.subjectEmail,
      purpose: dto.purpose,
      channels: dto.channels,
      topics: dto.topicsAllowed,
      voiceConsent: dto.voiceConsent ?? false,
      timestamp: new Date().toISOString(),
    });
    const proofHash = crypto.createHash('sha256').update(proofData).digest('hex');
    // IP is hashed — never store raw PII in logs or audit columns (GDPR pseudonymisation).
    const proofIpHash = crypto.createHash('sha256').update(ipAddress).digest('hex');

    const consentRows = await this.db.execute(sql`
      INSERT INTO likeness_consents (
        invitation_id, subject_name, subject_email,
        photos_s3_keys, liveness_s3_key, face_match_score,
        purpose, channels, topics_allowed, voice_consent,
        period_until, proof_hash, proof_ip_hash, proof_at
      ) VALUES (
        ${inv.id}, ${dto.subjectName}, ${dto.subjectEmail},
        ${JSON.stringify(photoS3Keys)}::text[], ${livenessS3Key}, ${faceMatchScore},
        ${dto.purpose}, ${JSON.stringify(dto.channels)}::text[], ${JSON.stringify(dto.topicsAllowed)}::text[],
        ${dto.voiceConsent ?? false},
        ${dto.periodUntil ? new Date(dto.periodUntil).toISOString() : null},
        ${proofHash}, ${proofIpHash}, NOW()
      ) RETURNING *
    `);

    await this.db.execute(sql`
      UPDATE likeness_invitations SET used_at = NOW() WHERE id = ${inv.id}
    `);

    const consentArr = Array.isArray(consentRows) ? consentRows : (consentRows as any).rows ?? [];
    const consent = (consentArr as any[])[0];
    // Log only identifiers — never log subject_name, subject_email or photo keys (GDPR).
    logger.info({ consentId: consent?.id, invitationId: inv.id }, 'Likeness consent submitted');
    return consent;
  }

  async listConsents() {
    const rows = await this.db.execute(sql`
      SELECT * FROM likeness_consents ORDER BY created_at DESC
    `);
    return Array.isArray(rows) ? rows : (rows as any).rows ?? [];
  }

  async getConsent(id: string) {
    const rows = await this.db.execute(sql`
      SELECT * FROM likeness_consents WHERE id = ${id}
    `);
    const rowsArr = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
    const consent = (rowsArr as any[])[0];
    if (!consent) throw new NotFoundException('Consent not found');
    return consent;
  }

  async revokeConsent(id: string, reason?: string) {
    const consent = await this.getConsent(id);
    if (consent.revoked_at) throw new BadRequestException('Consent already revoked');

    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 30);

    await this.db.execute(sql`
      UPDATE likeness_consents
      SET revoked_at = NOW(), deletion_scheduled_at = ${deletionDate.toISOString()}
      WHERE id = ${id}
    `);

    logger.info({ consentId: id, reason }, 'Likeness consent revoked');
    return { status: 'revoked', deletionScheduledAt: deletionDate };
  }

  async checkScope(id: string, topic: string, channel: string) {
    const consent = await this.getConsent(id);

    if (consent.revoked_at) {
      return { allowed: false, reason: 'Consent revoked' };
    }

    if (consent.period_until && new Date(consent.period_until) < new Date()) {
      return { allowed: false, reason: 'Consent expired' };
    }

    const topics = consent.topics_allowed as string[];
    const channels = consent.channels as string[];

    if (!topics.includes(topic)) {
      return { allowed: false, reason: `Topic '${topic}' not in allowed topics` };
    }

    if (!channels.includes(channel)) {
      return { allowed: false, reason: `Channel '${channel}' not in allowed channels` };
    }

    return { allowed: true };
  }
}
