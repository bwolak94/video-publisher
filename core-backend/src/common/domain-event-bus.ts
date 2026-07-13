/**
 * Lightweight in-process domain event bus (Node EventEmitter wrapper).
 *
 * Solves circular-dependency problems between modules that need to emit events
 * (e.g. MediaModule, CostModule) and modules that react to them (WebhooksModule).
 * Both sides inject this global singleton — no direct cross-module imports needed.
 */
import { Injectable } from "@nestjs/common";
import { EventEmitter } from "events";

export interface ProviderFailoverEvent {
  primaryProvider: string;
  fallbackProvider: string;
  sceneId?: string;
  reason: string;
}

export interface CostAnomalyEvent {
  projectId?: string;
  sceneId?: string;
  provider: string;
  assetType: string;
  costUsd: number;
  averageUsd: number;
  multiplier: number;
}

export type DomainEventMap = {
  "provider.failover": ProviderFailoverEvent;
  "cost.anomaly": CostAnomalyEvent;
};

@Injectable()
export class DomainEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(20);
  }

  emit<K extends keyof DomainEventMap>(event: K, payload: DomainEventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof DomainEventMap>(event: K, listener: (payload: DomainEventMap[K]) => void): void {
    this.emitter.on(event, listener as (p: unknown) => void);
  }
}
