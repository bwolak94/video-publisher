import { Controller, Post, Body } from "@nestjs/common";
import { AlertService } from "./alert.service";
import pino from "pino";

const logger = pino({ level: "info" });

interface PrometheusAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  status: "firing" | "resolved";
}

interface AlertmanagerWebhook {
  alerts: PrometheusAlert[];
}

@Controller("api/alerts")
export class AlertsController {
  constructor(private readonly alertService: AlertService) {}

  @Post("webhook")
  async prometheusWebhook(@Body() body: AlertmanagerWebhook) {
    const firing = (body.alerts ?? []).filter((a) => a.status === "firing");

    for (const alert of firing) {
      const alertName = alert.labels.alertname ?? "UnknownAlert";
      const severity = alert.labels.severity ?? "warning";
      const summary = alert.annotations.summary ?? alertName;

      logger.info({ alertName, severity }, "Prometheus alert received");

      await this.alertService.send(alertName, {
        errorMessage: summary,
        queueName: alert.labels.queue,
        extra: { severity },
      });
    }

    return { received: firing.length };
  }
}
