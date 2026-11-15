/** The player's personal theme song (ElevenLabs Music, generated on our server). */
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, C, F, P, Panel, Row, Tag } from '@/components/kit';
import { Sprite } from '@/components/sprites';
import { api, authedSource } from '@/lib/api';

type Theme = { status: 'none' | 'pending' | 'ready' | 'failed'; prompt: string | null; version: number; audio: string | null };

export function ThemeSongCard() {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  const load = useCallback(async () => {
    try {
      setTheme(await api<Theme>('GET', '/me/theme'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api<Theme>('GET', '/me/theme')
      .then((t) => alive && setTheme(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Poll while the band is composing.
  useEffect(() => {
    if (theme?.status !== 'pending') return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [theme?.status, load]);

  // Load the track whenever a new version is ready.
  useEffect(() => {
    if (theme?.status !== 'ready' || !theme.audio) return;
    let alive = true;
    authedSource(theme.audio).then((src) => {
      if (!alive) return;
      player.replace(src);
      player.loop = true;
    });
    return () => {
      alive = false;
    };
  }, [theme?.status, theme?.audio, player]);

  const compose = async () => {
    setBusy(true);
    setErr(null);
    try {
      player.pause();
      setTheme(await api<Theme>('POST', '/me/theme'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const playing = status.playing;
  const st = theme?.status ?? 'none';

  return (
    <Panel color={C.peri}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Row gap={8} style={{ flexShrink: 1, flexWrap: 'nowrap' }}>
          <View style={[s.disc, playing && s.discOn]}>
            <Sprite name="compass" size={36} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={s.title}>YOUR THEME SONG</Text>
            <P color={C.ink}>One of a kind, composed for you by AI.</P>
          </View>
        </Row>
        {st === 'pending' ? <Tag label="COMPOSING…" color={C.orange} /> : null}
      </Row>

      {st === 'ready' ? (
        <Row gap={8}>
          <View style={{ flex: 1 }}>
            <Btn label={playing ? 'Pause' : 'Play'} color={C.orange} onPress={() => (playing ? player.pause() : player.play())} />
          </View>
          <Btn small label="Remix" color={C.cloud} onPress={compose} busy={busy} />
        </Row>
      ) : st === 'pending' ? (
        <P color={C.ink}>The band is composing your shanty (about 30 seconds)…</P>
      ) : (
        <Btn label={st === 'failed' ? 'Try again' : 'Compose my theme'} color={C.orange} onPress={compose} busy={busy} />
      )}

      {theme?.prompt ? (
        <Text style={s.prompt} numberOfLines={3}>
          🎼 {theme.prompt.replace(/^Original instrumental sea-adventure theme for a cozy cartoon pirate game, no vocals, no lyrics\. /, '')}
        </Text>
      ) : null}
      {err ? <P color={C.red}>⚠️ {err}</P> : null}
    </Panel>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: F.title, fontSize: 24, letterSpacing: 1.5, color: C.ink },
  disc: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: C.ink, backgroundColor: C.cloud, alignItems: 'center', justifyContent: 'center' },
  discOn: { backgroundColor: C.gold },
  prompt: { fontFamily: F.body, fontSize: 12, color: C.navy, fontStyle: 'italic' },
});
