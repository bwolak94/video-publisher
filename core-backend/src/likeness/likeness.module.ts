import { Module } from '@nestjs/common';
import { LikenessController } from './likeness.controller';
import { LikenessService } from './likeness.service';

@Module({
  controllers: [LikenessController],
  providers: [LikenessService],
  exports: [LikenessService],
})
export class LikenessModule {}
