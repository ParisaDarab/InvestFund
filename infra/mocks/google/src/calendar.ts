import { createHash } from 'node:crypto';

import express from 'express';
import { z } from 'zod';

import { authenticate, googleError, queryParam, type Context } from './http.js';
import { ACCEPTED_SCOPES, type User } from './state.js';
import {
  busyInWindow,
  dateToEpoch,
  eventTimeToEpoch,
  parseRfc3339,
  toUtcString,
  type Interval,
} from './time.js';

import type { Application } from 'express';

const FreeBusyBody = z.looseObject({
  timeMin: z.string(),
  timeMax: z.string(),
  timeZone: z.string().optional(),
  items: z
    .array(z.looseObject({ id: z.string().min(1) }))
    .min(1)
    .max(50),
});

const EventTime = z.looseObject({
  dateTime: z.string().optional(),
  date: z.string().optional(),
  timeZone: z.string().optional(),
});

const EventBody = z.looseObject({
  /** Client-supplied ID (base32hex, 5–1024 characters), as the Calendar API allows. */
  id: z
    .string()
    .regex(/^[a-v0-9]{5,1024}$/)
    .optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: EventTime,
  end: EventTime,
  transparency: z.enum(['opaque', 'transparent']).optional(),
  attendees: z
    .array(
      z.looseObject({
        email: z.email(),
        displayName: z.string().optional(),
        optional: z.boolean().optional(),
      }),
    )
    .optional(),
  conferenceData: z
    .looseObject({
      createRequest: z
        .looseObject({
          requestId: z.string().min(1),
          conferenceSolutionKey: z.looseObject({ type: z.string() }).optional(),
        })
        .optional(),
    })
    .optional(),
});

function eventEpoch(time: z.infer<typeof EventTime>): number | null {
  if (time.dateTime !== undefined) return eventTimeToEpoch(time.dateTime, time.timeZone);
  if (time.date !== undefined) return dateToEpoch(time.date);
  return null;
}

/** Deterministic Meet code (`abc-defg-hij`) for an event ID. */
function meetCode(eventId: string): string {
  const letters = [...createHash('sha256').update(`meet:${eventId}`).digest()]
    .slice(0, 10)
    .map((byte) => String.fromCharCode(97 + (byte % 26)))
    .join('');
  return `${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7, 10)}`;
}

export function registerCalendar(app: Application, ctx: Context): void {
  /** `primary` or the user's own address; the mock has no shared calendars. */
  const ownCalendar = (calendarId: string, user: User): boolean =>
    calendarId === 'primary' || calendarId.toLowerCase() === user.email;

  app.post('/calendar/v3/freeBusy', express.json({ limit: '1mb' }), (req, res) => {
    const auth = authenticate(ctx, req, res, ACCEPTED_SCOPES.freeBusy);
    if (auth === null) return;
    const parsed = FreeBusyBody.safeParse(req.body);
    const timeMin = parsed.success ? parseRfc3339(parsed.data.timeMin) : null;
    const timeMax = parsed.success ? parseRfc3339(parsed.data.timeMax) : null;
    if (!parsed.success || timeMin === null || timeMax === null) {
      googleError(res, 400, 'badRequest', 'Bad Request');
      return;
    }
    if (timeMax <= timeMin) {
      googleError(res, 400, 'timeRangeEmpty', 'The specified time range is empty.');
      return;
    }
    const state = ctx.state();
    const calendars: Record<string, unknown> = {};
    for (const { id } of parsed.data.items) {
      const owner = id === 'primary' ? auth.user : state.users.get(id.toLowerCase());
      if (owner === undefined) {
        calendars[id] = { errors: [{ domain: 'global', reason: 'notFound' }], busy: [] };
        continue;
      }
      const intervals: Interval[] = [...owner.busy];
      for (const event of state.events.values()) {
        if (event.calendar === owner.email && event.status === 'confirmed' && !event.transparent) {
          intervals.push({ start: event.start, end: event.end });
        }
      }
      calendars[id] = {
        busy: busyInWindow(intervals, timeMin, timeMax).map((interval) => ({
          start: toUtcString(interval.start),
          end: toUtcString(interval.end),
        })),
      };
    }
    const record = ctx.record(req);
    if (record !== undefined) {
      record.detail = {
        timeMin: toUtcString(timeMin),
        timeMax: toUtcString(timeMax),
        calendars: parsed.data.items.map((item) => item.id),
      };
    }
    // Busy blocks are always reported in UTC, whatever `timeZone` says.
    res.json({
      kind: 'calendar#freeBusy',
      timeMin: toUtcString(timeMin),
      timeMax: toUtcString(timeMax),
      calendars,
    });
  });

  app.post(
    '/calendar/v3/calendars/:calendarId/events',
    express.json({ limit: '1mb' }),
    (req, res) => {
      const auth = authenticate(ctx, req, res, ACCEPTED_SCOPES.events);
      if (auth === null) return;
      const calendarId = req.params.calendarId;
      if (!ownCalendar(calendarId, auth.user)) {
        googleError(res, 404, 'notFound', 'Not Found');
        return;
      }
      const parsed = EventBody.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        googleError(
          res,
          400,
          'invalid',
          `Invalid value at ${issue?.path.join('.') ?? 'body'}: ${issue?.message ?? ''}`,
        );
        return;
      }
      const body = parsed.data;
      const start = eventEpoch(body.start);
      const end = eventEpoch(body.end);
      if (start === null || end === null) {
        googleError(res, 400, 'required', 'Missing or invalid start/end time.');
        return;
      }
      if (end <= start) {
        googleError(res, 400, 'timeRangeEmpty', 'The specified time range is empty.');
        return;
      }
      const state = ctx.state();
      const id = body.id ?? state.nextEventId();
      const key = `${auth.user.email}/${id}`;
      if (state.events.has(key)) {
        googleError(res, 409, 'duplicate', 'The requested identifier already exists.');
        return;
      }
      const sendUpdates = queryParam(req, 'sendUpdates') ?? 'none';
      const conferenceDataVersion = queryParam(req, 'conferenceDataVersion') === '1' ? 1 : 0;
      const createRequest = body.conferenceData?.createRequest;
      const now = toUtcString(state.tick()).replace('Z', '.000Z');
      const self = { email: auth.user.email, self: true };

      let conference: Record<string, unknown> = {};
      if (conferenceDataVersion === 1 && createRequest !== undefined) {
        const code = meetCode(id);
        const link = `https://meet.google.com/${code}`;
        conference = {
          hangoutLink: link,
          conferenceData: {
            createRequest: {
              requestId: createRequest.requestId,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
              status: { statusCode: 'success' },
            },
            entryPoints: [{ entryPointType: 'video', uri: link, label: link.slice(8) }],
            conferenceSolution: {
              key: { type: 'hangoutsMeet' },
              name: 'Google Meet',
            },
            conferenceId: code,
          },
        };
      }

      const resource: Record<string, unknown> = {
        kind: 'calendar#event',
        etag: `"${String(state.events.size + 1)}"`,
        id,
        status: 'confirmed',
        htmlLink: `https://www.google.com/calendar/event?eid=${Buffer.from(`${id} ${auth.user.email}`).toString('base64url')}`,
        created: now,
        updated: now,
        ...(body.summary === undefined ? {} : { summary: body.summary }),
        ...(body.description === undefined ? {} : { description: body.description }),
        ...(body.location === undefined ? {} : { location: body.location }),
        creator: self,
        organizer: self,
        start: body.start,
        end: body.end,
        ...(body.transparency === undefined ? {} : { transparency: body.transparency }),
        iCalUID: `${id}@google.com`,
        sequence: 0,
        ...(body.attendees === undefined
          ? {}
          : {
              attendees: body.attendees.map((attendee) => ({
                ...attendee,
                responseStatus: 'needsAction',
              })),
            }),
        reminders: { useDefault: true },
        eventType: 'default',
        ...conference,
      };
      state.events.set(key, {
        id,
        calendar: auth.user.email,
        status: 'confirmed',
        start,
        end,
        transparent: body.transparency === 'transparent',
        resource,
      });
      const record = ctx.record(req);
      if (record !== undefined) {
        record.detail = {
          calendarId,
          eventId: id,
          sendUpdates,
          conferenceDataVersion,
          start: toUtcString(start),
          end: toUtcString(end),
          attendees: body.attendees?.map((attendee) => attendee.email) ?? [],
          summary: body.summary ?? null,
        };
      }
      res.json(resource);
    },
  );

  app.delete('/calendar/v3/calendars/:calendarId/events/:eventId', (req, res) => {
    const auth = authenticate(ctx, req, res, ACCEPTED_SCOPES.events);
    if (auth === null) return;
    const calendarId = req.params.calendarId;
    const eventId = req.params.eventId;
    const event = ownCalendar(calendarId, auth.user)
      ? ctx.state().events.get(`${auth.user.email}/${eventId}`)
      : undefined;
    const record = ctx.record(req);
    if (record !== undefined) {
      record.detail = {
        calendarId,
        eventId,
        sendUpdates: queryParam(req, 'sendUpdates') ?? 'none',
      };
    }
    if (event === undefined) {
      googleError(res, 404, 'notFound', 'Not Found');
      return;
    }
    if (event.status === 'cancelled') {
      googleError(res, 410, 'deleted', 'Resource has been deleted');
      return;
    }
    event.status = 'cancelled';
    event.resource = { ...event.resource, status: 'cancelled' };
    res.status(204).end();
  });
}
