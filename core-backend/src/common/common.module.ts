/**
 * Global CommonModule — provides the DomainEventBus singleton and CronLockService
 * across all modules. Importing this in AppModule makes both injectable everywhere
 * without each feature module needing to declare them.
 */
import { Global, Module } from "@nestjs/common";
import { DomainEventBus } from "./domain-event-bus";
import { CronLockService } from "./cron-lock.service";

@Global()
@Module({
  providers: [DomainEventBus, CronLockService],
  exports: [DomainEventBus, CronLockService],
})
export class CommonModule {}
