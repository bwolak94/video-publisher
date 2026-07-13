import { Module } from "@nestjs/common";
import { ReviewSessionService } from "./review-session.service";
import { ReviewController } from "./review.controller";

@Module({
  controllers: [ReviewController],
  providers: [ReviewSessionService],
  exports: [ReviewSessionService],
})
export class ReviewModule {}
