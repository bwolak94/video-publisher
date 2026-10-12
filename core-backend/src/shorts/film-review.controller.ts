import { Controller, Post, Get, Param } from '@nestjs/common';
import { FilmReviewService } from './film-review.service';

@Controller()
export class FilmReviewController {
  constructor(private readonly filmReviewService: FilmReviewService) {}

  /**
   * Operator creates (or retrieves existing) review link for a finalized shorts job.
   * POST /shorts/:jobId/send-review
   */
  @Post('shorts/:jobId/send-review')
  sendReview(@Param('jobId') jobId: string) {
    return this.filmReviewService.sendReview(jobId);
  }

  /**
   * Public — the person featured in the film loads their review page.
   * GET /review/:token
   */
  @Get('review/:token')
  findByToken(@Param('token') token: string) {
    return this.filmReviewService.findByToken(token);
  }

  /**
   * Public — the person approves use of their likeness.
   * POST /review/:token/approve
   */
  @Post('review/:token/approve')
  approve(@Param('token') token: string) {
    return this.filmReviewService.approve(token);
  }

  /**
   * Public — the person rejects use of their likeness.
   * POST /review/:token/reject
   */
  @Post('review/:token/reject')
  reject(@Param('token') token: string) {
    return this.filmReviewService.reject(token);
  }

  /**
   * Operator list — returns latest 50 reviews across all jobs.
   * GET /shorts/reviews
   */
  @Get('shorts/reviews')
  listReviews() {
    return this.filmReviewService.listReviews();
  }
}
