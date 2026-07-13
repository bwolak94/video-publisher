/**
 * Global CommonModule — provides the DomainEventBus singleton across all modules.
 * Importing this in AppModule makes DomainEventBus injectable everywhere without
 * each feature module needing to declare it.
 */
import { Global, Module } from "@nestjs/common";
import { DomainEventBus } from "./domain-event-bus";

@Global()
@Module({
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class CommonModule {}
