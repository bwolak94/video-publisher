import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { LikenessService } from './likeness.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { SubmitConsentDto } from './dto/submit-consent.dto';

@Controller('likeness')
export class LikenessController {
  constructor(private readonly likenessService: LikenessService) {}

  @Post('invitations')
  createInvitation(@Body() dto: CreateInvitationDto) {
    return this.likenessService.createInvitation(dto);
  }

  @Get('invitations/:token')
  getInvitation(@Param('token') token: string) {
    return this.likenessService.getInvitation(token);
  }

  /**
   * Submit consent — accepts a JSON body containing the DTO and pre-uploaded S3 keys.
   * Real file uploads are handled by a separate presigned-URL flow; this endpoint
   * records the consent metadata and links it to the invitation token.
   */
  @Post('invitations/:token/submit')
  submitConsent(
    @Param('token') token: string,
    @Body() body: { dto: SubmitConsentDto; photoS3Keys: string[]; livenessS3Key: string },
    @Request() req: any,
  ) {
    const ip: string =
      req.ip ?? req.headers?.['x-forwarded-for'] ?? '0.0.0.0';
    return this.likenessService.submitConsent(
      token,
      body.dto,
      body.photoS3Keys,
      body.livenessS3Key,
      ip,
    );
  }

  @Get()
  listConsents() {
    return this.likenessService.listConsents();
  }

  @Get(':id')
  getConsent(@Param('id') id: string) {
    return this.likenessService.getConsent(id);
  }

  @Post(':id/revoke')
  revokeConsent(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.likenessService.revokeConsent(id, body.reason);
  }

  @Get(':id/check-scope')
  checkScope(
    @Param('id') id: string,
    @Query('topic') topic: string,
    @Query('channel') channel: string,
  ) {
    return this.likenessService.checkScope(id, topic, channel);
  }
}
