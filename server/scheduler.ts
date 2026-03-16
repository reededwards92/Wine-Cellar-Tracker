import cron from "node-cron";
import pool from "./db";

interface NotificationTarget {
  user_id: number;
  push_token: string;
  daily_max: number;
  wine_id: number;
  producer: string;
  wine_name: string;
  vintage: number | null;
  drink_window_start: number;
  drink_window_end: number;
}

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<boolean> {
  try {
    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: token, title, body, data, sound: "default" }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function runDrinkWindowAlerts() {
  try {
    const currentYear = new Date().getFullYear();

    const result = await pool.query(`
      SELECT DISTINCT ON (w.id, u.id)
        u.id as user_id,
        u.push_token,
        COALESCE(np.daily_max, 2) as daily_max,
        w.id as wine_id,
        w.producer,
        w.wine_name,
        w.vintage,
        w.drink_window_start,
        w.drink_window_end
      FROM wines w
      JOIN users u ON w.user_id = u.id
      JOIN bottles b ON b.wine_id = w.id AND b.status = 'in_cellar' AND b.user_id = u.id
      LEFT JOIN notification_preferences np ON u.id = np.user_id
      WHERE u.push_token IS NOT NULL
        AND (np.drink_window_alerts IS NULL OR np.drink_window_alerts = true)
        AND (w.drink_window_start = $1 OR w.drink_window_start = $2)
        AND NOT EXISTS (
          SELECT 1 FROM notification_log nl
          WHERE nl.user_id = u.id AND nl.wine_id = w.id
          AND nl.type = 'drink_window'
          AND nl.sent_at > NOW() - INTERVAL '90 days'
        )
      ORDER BY w.id, u.id, w.drink_window_start ASC
    `, [currentYear, currentYear + 1]);

    // Group by user and cap at daily_max
    const userNotifs = new Map<number, NotificationTarget[]>();
    for (const row of result.rows) {
      const list = userNotifs.get(row.user_id) || [];
      if (list.length < row.daily_max) {
        list.push(row);
        userNotifs.set(row.user_id, list);
      }
    }

    for (const [_userId, targets] of userNotifs) {
      for (const t of targets) {
        const vintageStr = t.vintage ? ` ${t.vintage}` : "";
        const body = `Your ${t.producer} ${t.wine_name}${vintageStr} is entering its drinking window — ideal ${t.drink_window_start}–${t.drink_window_end}.`;

        const sent = await sendExpoPush(
          t.push_token,
          "From Cru \uD83C\uDF77",
          body,
          { wineId: t.wine_id }
        );

        if (sent) {
          await pool.query(
            "INSERT INTO notification_log (user_id, wine_id, type) VALUES ($1, $2, 'drink_window')",
            [t.user_id, t.wine_id]
          );
        }
      }
    }

    const totalSent = Array.from(userNotifs.values()).reduce((sum, arr) => sum + arr.length, 0);
    if (totalSent > 0) {
      console.log(`[scheduler] Sent ${totalSent} drink window notifications`);
    }
  } catch (error) {
    console.error("[scheduler] Drink window alerts error:", error);
  }
}

export function initializeScheduler() {
  // Run daily at 9:00 AM UTC
  cron.schedule("0 9 * * *", () => {
    runDrinkWindowAlerts();
  });

  console.log("[scheduler] Initialized — drink window alerts scheduled daily at 9:00 UTC");
}
