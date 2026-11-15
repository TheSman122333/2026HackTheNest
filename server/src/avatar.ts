import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { Binary, ObjectId } from 'mongodb';
import { z } from 'zod';

import { AVATAR_IDS, type Collections, type UserDoc } from './db';

const MAX_BYTES = 1_500_000;
const photoInput = z.object({
  base64: z.string().min(4).max(2_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  width: z.number().int().min(1).max(1024), height: z.number().int().min(1).max(1024),
  zoom: z.number().min(1).max(4), offsetX: z.number().finite(), offsetY: z.number().finite(),
}).strict().refine((p) => Math.abs(p.offsetX) <= (p.zoom - 1) / 2 && Math.abs(p.offsetY) <= (p.zoom - 1) / 2, 'Photo position is outside the frame');

/** Read JPEG dimensions without decoding or sending a face to any external service. */
function jpegSize(bytes: Buffer) {
  if (bytes.length < 12 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at++] !== 0xff) return null;
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (at + 2 > bytes.length) return null;
    if (marker === 0xda || marker === 0xd9) return null;
    const length = bytes.readUInt16BE(at);
    if (length < 2 || at + length > bytes.length) return null;
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 8) return null;
      return { width: bytes.readUInt16BE(at + 5), height: bytes.readUInt16BE(at + 3) };
    }
    at += length;
  }
  return null;
}

export function registerAvatar(app: Hono<{ Variables: { user: UserDoc } }>, c: Collections) {
  app.put('/me/avatar', bodyLimit({ maxSize: 2_100_000, onError: () => { throw new HTTPException(413, { message: 'Choose a smaller photo.' }); } }), async (ctx) => {
    const input = z.object({ avatarId: z.enum(AVATAR_IDS), photo: photoInput.nullable().optional() }).strict().parse(await ctx.req.json().catch(() => ({})));
    let photo: UserDoc['profilePhoto'];
    if (input.photo) {
      const { base64, ...fit } = input.photo;
      const bytes = Buffer.from(base64, 'base64');
      const size = jpegSize(bytes);
      if (bytes.length > MAX_BYTES || bytes.toString('base64') !== base64 || !size || size.width !== fit.width || size.height !== fit.height) {
        throw new HTTPException(400, { message: 'Use a JPEG photo no larger than 1024 pixels and 1.5 MB.' });
      }
      photo = { ...fit, bytes: new Binary(bytes), updatedAt: new Date() };
    }
    await c.users.updateOne({ _id: ctx.get('user')._id }, {
      $set: { avatarId: input.avatarId, ...(photo ? { profilePhoto: photo } : {}), ...(input.photo !== undefined ? { profilePhotoUpdatedAt: new Date() } : {}) },
      ...(input.photo === null ? { $unset: { profilePhoto: '' as const } } : {}),
    });
    return ctx.json({ avatarId: input.avatarId });
  });
  /** Whether other players see your face photo (your own devices always do). */
  app.put('/me/photo-visibility', async (ctx) => {
    const input = z.object({ public: z.boolean() }).strict().safeParse(await ctx.req.json().catch(() => ({})));
    if (!input.success) throw new HTTPException(400, { message: 'Send { public: true | false }.' });
    await c.users.updateOne({ _id: ctx.get('user')._id }, { $set: { photoPublic: input.data.public } });
    return ctx.json({ photoPublic: input.data.public });
  });

  /** Another player's face photo, only if they've chosen to show it. Never sent to AI. */
  app.get('/users/:id/avatar/photo', async (ctx) => {
    const id = ctx.req.param('id');
    ctx.header('Cache-Control', 'private, max-age=300');
    if (!ObjectId.isValid(id)) return ctx.json({ photo: null });
    const me = ctx.get('user');
    const owner = await c.users.findOne({ _id: new ObjectId(id) }, { projection: { profilePhoto: 1, photoPublic: 1 } });
    const photo = owner?.profilePhoto;
    if (!photo || (owner.photoPublic === false && !owner._id.equals(me._id))) return ctx.json({ photo: null });
    return ctx.json({ photo: { uri: `data:image/jpeg;base64,${Buffer.from(photo.bytes.buffer).toString('base64')}`, width: photo.width, height: photo.height, zoom: photo.zoom, offsetX: photo.offsetX, offsetY: photo.offsetY } });
  });

  app.get('/me/avatar/photo', async (ctx) => {
    const user = await c.users.findOne({ _id: ctx.get('user')._id }, { projection: { profilePhoto: 1, profilePhotoUpdatedAt: 1 } });
    const photo = user?.profilePhoto;
    ctx.header('Cache-Control', 'private, no-store');
    if (!photo) return ctx.json({ photo: null, configured: Boolean(user?.profilePhotoUpdatedAt) });
    return ctx.json({ photo: { uri: `data:image/jpeg;base64,${Buffer.from(photo.bytes.buffer).toString('base64')}`, width: photo.width, height: photo.height, zoom: photo.zoom, offsetX: photo.offsetX, offsetY: photo.offsetY } });
  });
}
