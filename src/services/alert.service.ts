import { prisma } from "../lib/db/prisma";
import { eventBus } from "../lib/events/event-bus";
import { logger } from "../lib/observability/logger";
import { incrementCounter } from "../lib/observability/metrics";

export type AlertCondition =
  | "GREATER_THAN"
  | "LESS_THAN"
  | "DROPS_BY_PCT"
  | "ANOMALY_DETECTED";

export interface EvaluateAlertParams {
  organizationId: string;
  metricCode: string;
  currentValue: number;
  baselineValue?: number;
  details?: Record<string, any>;
}

export interface FiredAlertResult {
  alertId: string;
  alertName: string;
  metricCode: string;
  condition: string;
  currentValue: number;
  thresholdValue: number;
  notificationId: string;
}

export class AlertService {
  /**
   * Evaluates active alert rules against current metric values, checking thresholds and cooldowns.
   */
  public static async evaluateAlerts(
    params: EvaluateAlertParams
  ): Promise<FiredAlertResult[]> {
    const { organizationId, metricCode, currentValue, baselineValue, details } = params;

    const rules = await prisma.alert.findMany({
      where: {
        organizationId,
        isActive: true,
        metricCode,
      },
    });

    const now = new Date();
    const firedAlerts: FiredAlertResult[] = [];

    for (const rule of rules) {
      // 1. Check Cooldown Period
      if (rule.lastTriggeredAt) {
        const elapsedHours =
          (now.getTime() - new Date(rule.lastTriggeredAt).getTime()) / (1000 * 60 * 60);
        if (elapsedHours < rule.cooldownHours) {
          // Still in cooldown window, suppress notification storm
          continue;
        }
      }

      // 2. Evaluate Condition
      let triggered = false;
      let triggerReason = "";

      switch (rule.condition as AlertCondition) {
        case "GREATER_THAN":
          if (currentValue > rule.thresholdValue) {
            triggered = true;
            triggerReason = `Value ${currentValue} exceeded threshold ${rule.thresholdValue}`;
          }
          break;

        case "LESS_THAN":
          if (currentValue < rule.thresholdValue) {
            triggered = true;
            triggerReason = `Value ${currentValue} fell below threshold ${rule.thresholdValue}`;
          }
          break;

        case "DROPS_BY_PCT":
          if (baselineValue && baselineValue > 0) {
            const dropPct = ((baselineValue - currentValue) / baselineValue) * 100;
            if (dropPct >= rule.thresholdValue) {
              triggered = true;
              triggerReason = `Dropped by ${dropPct.toFixed(1)}% (threshold: ${rule.thresholdValue}%)`;
            }
          }
          break;

        case "ANOMALY_DETECTED":
          if (Math.abs(currentValue) >= rule.thresholdValue) {
            triggered = true;
            triggerReason = `Statistical anomaly deviation (${currentValue}%) reached threshold ${rule.thresholdValue}%`;
          }
          break;
      }

      if (triggered) {
        // 3. Update lastTriggeredAt atomically
        await prisma.alert.update({
          where: { id: rule.id },
          data: { lastTriggeredAt: now },
        });

        // 4. Create Notification in Database
        const notification = await prisma.notification.create({
          data: {
            organizationId,
            title: `Alert Triggered: ${rule.name}`,
            message: `${rule.metricCode}: ${triggerReason}.`,
            type: "ANOMALY_ALERT",
            linkUrl: "/alerts",
          },
        });

        // 5. Dispatch Event over Event Bus to connected SSE streams
        const alertPayload = {
          alertId: rule.id,
          name: rule.name,
          metricCode: rule.metricCode,
          condition: rule.condition,
          currentValue,
          thresholdValue: rule.thresholdValue,
          reason: triggerReason,
          notificationId: notification.id,
          details,
        };

        eventBus.publishToTenant(organizationId, "ALERT_TRIGGERED", alertPayload);
        incrementCounter("alerts_triggered_total", 1, {
          metricCode: rule.metricCode,
          condition: rule.condition,
        });

        firedAlerts.push({
          alertId: rule.id,
          alertName: rule.name,
          metricCode: rule.metricCode,
          condition: rule.condition,
          currentValue,
          thresholdValue: rule.thresholdValue,
          notificationId: notification.id,
        });

        logger.info(`Alert rule triggered: ${rule.name} for tenant ${organizationId}`, {
          alertId: rule.id,
          triggerReason,
        });
      }
    }

    return firedAlerts;
  }
}
