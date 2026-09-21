import { getIntegration, upsertIntegration } from "@/lib/integrations/store";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function getGoogleCalendarAuthUrl(state: string) {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/integrations/google-calendar/callback`;

  if (!clientId) throw new Error("Google OAuth not configured");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `${CALENDAR_SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCalendarCode(code: string) {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/integrations/google-calendar/callback`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  }>;
}

async function refreshGoogleToken(userId: string) {
  const integration = await getIntegration(userId, "google_calendar");
  if (!integration?.refreshToken) return null;

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: integration.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  await upsertIntegration(userId, "google_calendar", {
    accessToken: data.access_token,
    refreshToken: integration.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  });
  return data.access_token as string;
}

export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const integration = await getIntegration(userId, "google_calendar");
  if (!integration) return null;

  if (integration.expiresAt && integration.expiresAt.getTime() < Date.now() + 60000) {
    return refreshGoogleToken(userId);
  }
  return integration.accessToken;
}

async function googleCalendarFetch(userId: string, path: string, options: RequestInit = {}) {
  const token = await getGoogleAccessToken(userId);
  if (!token) throw new Error("Google Calendar not connected");

  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) throw new Error(`Google Calendar API error: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

export async function createGoogleCalendarEvent(
  userId: string,
  event: { summary: string; description?: string; start: Date; end?: Date }
) {
  const end = event.end || new Date(event.start.getTime() + 3600000);
  return googleCalendarFetch(userId, "/calendars/primary/events", {
    method: "POST",
    body: JSON.stringify({
      summary: event.summary,
      description: event.description || "Created by LifeFlow AI",
      start: { dateTime: event.start.toISOString() },
      end: { dateTime: end.toISOString() },
    }),
  }) as Promise<{ id: string }>;
}

export async function updateGoogleCalendarEvent(
  userId: string,
  eventId: string,
  event: { summary: string; description?: string; start: Date; end?: Date }
) {
  const end = event.end || new Date(event.start.getTime() + 3600000);
  return googleCalendarFetch(userId, `/calendars/primary/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start.toISOString() },
      end: { dateTime: end.toISOString() },
    }),
  });
}

export async function deleteGoogleCalendarEvent(userId: string, eventId: string) {
  await googleCalendarFetch(userId, `/calendars/primary/events/${eventId}`, { method: "DELETE" });
}

export async function listTodayCalendarEvents(userId: string) {
  const token = await getGoogleAccessToken(userId);
  if (!token) return [];

  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    maxResults: "12",
    singleEvents: "true",
    orderBy: "startTime",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];

  const data = await res.json();
  return (data.items || [])
    .map((event: { summary?: string; start?: { dateTime?: string; date?: string } }) => {
      const start = event.start?.dateTime || event.start?.date;
      if (!event.summary || !start) return null;
      return { summary: event.summary as string, start };
    })
    .filter(Boolean) as Array<{ summary: string; start: string }>;
}
