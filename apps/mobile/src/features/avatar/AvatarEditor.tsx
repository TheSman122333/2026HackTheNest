import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn, C, F, H, P, Panel, Row, Screen, Title } from '@/components/kit';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { avatarFor } from '@/components/sprites';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';
import { useAvatarPhoto, type FacePhoto } from '@/state/avatarPhoto';
import { useSession } from '@/state/session';

import { choosePhoto, isSupported, takePhoto } from '../../../modules/avatar-camera';
import { AVATARS, type AvatarId } from './catalog';
import { releasePhoto, releaseTemporaryPhoto } from './photoStorage';

const PREVIEW_SIZE = 198;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 100) / 100;
function fit(photo: FacePhoto): FacePhoto {
  const zoom = round(clamp(photo.zoom, 1, 4));
  const bound = (zoom - 1) / 2;
  return { ...photo, zoom, offsetX: round(clamp(photo.offsetX, -bound, bound)), offsetY: round(clamp(photo.offsetY, -bound, bound)) };
}
const samePhoto = (a: FacePhoto | null, b: FacePhoto | null) => JSON.stringify(a) === JSON.stringify(b);

/** Only avatarId is sent to the game API. Camera bytes and face fitting remain local. */
export function AvatarEditor({ user }: { user: User }) {
  const fallback = avatarFor(user.id) as AvatarId;
  const [selected, setSelected] = useState<AvatarId>(() => AVATARS.find((avatar) => avatar.id === user.avatarId)?.id ?? fallback);
  const [photo, setPhoto] = useState<FacePhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const locked = useRef(false);
  const saveInFlight = useRef(false);
  const draftPhoto = useRef<FacePhoto | null>(null);
  const savedPhoto = useRef<FacePhoto | null>(null);
  const supported = isSupported();
  const off = loading || picking || saving;

  useEffect(() => {
    mounted.current = true;
    void useAvatarPhoto.getState().hydrate(user.id).then(() => {
      if (!mounted.current || useAvatarPhoto.getState().userId !== user.id) return;
      const state = useAvatarPhoto.getState();
      savedPhoto.current = state.photo;
      draftPhoto.current = state.photo;
      setPhoto(state.photo);
      setError(state.error);
      setLoading(false);
    });
    return () => {
      mounted.current = false;
      // An in-flight copy or rollback still needs its source until save finishes.
      if (!saveInFlight.current) void releaseTemporaryPhoto(draftPhoto.current);
    };
  }, [user.id]);

  const replaceDraft = (next: FacePhoto | null) => {
    const previous = draftPhoto.current;
    draftPhoto.current = next;
    if (mounted.current) setPhoto(next);
    if (previous?.uri !== next?.uri) void releaseTemporaryPhoto(previous);
  };

  const capture = async (kind: 'camera' | 'library') => {
    if (locked.current || off) return;
    locked.current = true;
    setPicking(true);
    setError(null);
    try {
      const result = await (kind === 'camera' ? takePhoto() : choosePhoto());
      if (result) {
        if (mounted.current) replaceDraft({ ...result, zoom: 1.4, offsetX: 0, offsetY: 0 });
        else await releaseTemporaryPhoto(result);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'That photo could not be opened. Please try again.');
    } finally {
      locked.current = false;
      if (mounted.current) setPicking(false);
    }
  };

  const changeFit = (change: Partial<Pick<FacePhoto, 'zoom' | 'offsetX' | 'offsetY'>>) => {
    const current = draftPhoto.current;
    if (current && !saveInFlight.current) replaceDraft(fit({ ...current, ...change }));
  };

  const save = async () => {
    if (locked.current || off) return;
    locked.current = true;
    saveInFlight.current = true;
    setSaving(true);
    setError(null);
    const previous = savedPhoto.current;
    const staged = draftPhoto.current;
    const changed = !samePhoto(previous, staged);
    let prepared = previous;
    let wroteLocal = false;
    try {
      if (changed) {
        prepared = await useAvatarPhoto.getState().save(user.id, staged);
        wroteLocal = true;
      }
      if (useSession.getState().me?.user.id !== user.id) throw new Error('Your signed-in pirate changed. Open the editor again.');
      // The previous local file is retained until the API choice also succeeds.
      await api<{ avatarId: AvatarId }>('PUT', '/me/avatar', { avatarId: selected });
      const me = useSession.getState().me;
      if (me?.user.id === user.id) useSession.getState().setMe({ user: { ...me.user, avatarId: selected } });
      await releasePhoto(user.id, previous, prepared?.uri);
      savedPhoto.current = prepared;
      replaceDraft(prepared);
      if (mounted.current) router.back();
    } catch (e) {
      let restored = true;
      if (wroteLocal) {
        try {
          await useAvatarPhoto.getState().save(user.id, previous);
          await releasePhoto(user.id, prepared, previous?.uri);
        } catch { restored = false; }
      }
      if (mounted.current) setError(restored
        ? e instanceof Error ? e.message : 'Your pirate could not be saved. Please try again.'
        : 'The avatar could not be saved, and the previous local photo could not be restored. Please save again to finish.');
    } finally {
      saveInFlight.current = false;
      if (!mounted.current) await releaseTemporaryPhoto(draftPhoto.current);
      locked.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return <Screen>
    <Row style={{ justifyContent: 'space-between' }}>
      <Btn small label="Cancel" color={C.deep} onPress={() => router.back()} disabled={saving} />
      <P dim>Your pirate, your way</P>
    </Row>
    <View style={{ gap: 6 }}><Title>Choose your pirate</Title><P dim>Pick a look, then fit your own face inside it.</P></View>

    <Panel color={C.deep} style={{ alignItems: 'center', paddingVertical: 24 }}>
      {loading ? <ActivityIndicator color={C.gold} size="large" /> : <PlayerAvatar userId={user.id} avatarId={selected} photo={photo} size={PREVIEW_SIZE} label="Your pirate preview" />}
      <H>{AVATARS.find((avatar) => avatar.id === selected)?.label ?? 'Your pirate'}</H>
      <P dim center>{photo ? 'Your photo stays on this device.' : 'The drawn face is used until you add a photo.'}</P>
    </Panel>

    {error ? <Panel color={C.deep} style={{ borderColor: C.red }}><P color={C.red}>{error}</P></Panel> : null}

    <Panel>
      <H>Your avatar</H>
      <View accessibilityRole="radiogroup" accessibilityLabel="Choose an illustrated pirate" style={s.grid}>
        {AVATARS.map((avatar) => <Pressable key={avatar.id} accessibilityRole="radio" accessibilityLabel={avatar.label} accessibilityState={{ checked: selected === avatar.id, disabled: off }} disabled={off}
          onPress={() => setSelected(avatar.id)} style={({ pressed }) => [s.option, selected === avatar.id && s.selected, pressed && { opacity: 0.76 }]}>
          <PlayerAvatar avatarId={avatar.id} photo={photo} size={74} label={avatar.label} />
          <Text style={s.optionName}>{avatar.label}</Text>
          <Text style={s.check}>{selected === avatar.id ? 'SELECTED' : 'CHOOSE'}</Text>
        </Pressable>)}
      </View>
    </Panel>

    <Panel>
      <H>Make it your face</H>
      <P dim>Take a centered portrait or choose a photo. Photos are never uploaded to the game server or sent to AI.</P>
      <Row>
        <Btn small label={photo ? 'Retake photo' : 'Take a photo'} onPress={() => capture('camera')} disabled={!supported || off} busy={picking} />
        <Btn small label="Choose photo" color={C.sky} onPress={() => capture('library')} disabled={!supported || off} />
      </Row>
      {!supported ? <P dim>Photo capture is unavailable in this version of the app. You can still choose an avatar.</P> : null}
      {photo ? <>
        <P dim>Zoom and move the photo until your face fits the opening.</P>
        <View style={{ alignItems: 'center' }}><PlayerAvatar avatarId={selected} photo={photo} size={144} label="Live face alignment preview" /></View>
        <Row style={{ justifyContent: 'space-between' }}>
          <Btn small label="Zoom out" color={C.sky} disabled={off || photo.zoom <= 1} onPress={() => changeFit({ zoom: photo.zoom - 0.2 })} />
          <P>{photo.zoom.toFixed(1)}×</P>
          <Btn small label="Zoom in" color={C.sky} disabled={off || photo.zoom >= 4} onPress={() => changeFit({ zoom: photo.zoom + 0.2 })} />
        </Row>
        <View style={s.cross}>
          <Btn small label="Up" color={C.indigo} disabled={off} onPress={() => changeFit({ offsetY: photo.offsetY - 0.05 })} />
          <Row gap={12}><Btn small label="Left" color={C.indigo} disabled={off} onPress={() => changeFit({ offsetX: photo.offsetX - 0.05 })} /><Btn small label="Right" color={C.indigo} disabled={off} onPress={() => changeFit({ offsetX: photo.offsetX + 0.05 })} /></Row>
          <Btn small label="Down" color={C.indigo} disabled={off} onPress={() => changeFit({ offsetY: photo.offsetY + 0.05 })} />
        </View>
        <Row><Btn small label="Center face" color={C.sky} disabled={off} onPress={() => changeFit({ offsetX: 0, offsetY: 0 })} /><Btn small label="Remove photo" color={C.cloud} disabled={off} onPress={() => { if (!locked.current) replaceDraft(null); }} /></Row>
      </> : null}
    </Panel>
    <Btn label="Save pirate" onPress={save} busy={saving} disabled={loading || picking} />
    <P dim center>Avatar choice follows your account. The face photo is private to this device.</P>
  </Screen>;
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { width: '30%', minHeight: 120, borderRadius: 12, borderWidth: 1, borderColor: '#C4C5BC', backgroundColor: '#E5E8DF', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 3, gap: 4 },
  selected: { borderWidth: 2, borderColor: '#B28A3D', backgroundColor: '#F5DEAB' },
  optionName: { fontFamily: F.bodyBold, color: C.ink, fontSize: 10, textAlign: 'center' },
  check: { fontFamily: F.bodyBold, color: C.dimDark, fontSize: 8, letterSpacing: 0.8 },
  cross: { alignItems: 'center', gap: 8, paddingVertical: 8 },
});
