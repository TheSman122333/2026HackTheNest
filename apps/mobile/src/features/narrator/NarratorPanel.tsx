/**
 * Narrator panel: plays spoken replies, hold-to-talk (foreground only, max 15 s, recording is
 * deleted right after upload), a typed fallback, and the Game Master world-event button.
 */
import { NARRATOR } from '@last-voyage/game';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Btn, F, Panel, Row } from '@/components/kit';
import { Sprite } from '@/components/sprites';
import { fetchAudio } from '@/lib/audio';

import { useNarrator } from './useNarrator';

const MAX_MS = 15_000;
const title = `THE ${NARRATOR.name.toUpperCase()}`;
const SEA = '#0D1B2A';
const PARCHMENT = '#F4EBD0';
const BRASS = '#C8963E';

export function NarratorPanel() {
  const {
    lines,
    busy,
    error,
    audioPath,
    audioNonce,
    sfxCueKeys,
    sfxCueNonce,
    briefing,
    say,
    worldEvent,
    clearSfxCueKeys,
  } = useNarrator();
  const player = useAudioPlayer(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [text, setText] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const starting = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // First visit this session: the narrator briefs you.
  useEffect(() => {
    briefing();
  }, [briefing]);

  // Play each new reply.
  useEffect(() => {
    if (!audioPath) return;
    let alive = true;
    let speakingTimeout: ReturnType<typeof setTimeout> | null = null;
    fetchAudio(audioPath, `narrator-${audioNonce}`)
      .then((uri) => {
        if (!alive) return;
        setSpeaking(true);
        player.replace({ uri });
        player.play();
        speakingTimeout = setTimeout(() => setSpeaking(false), 5000);
      })
      .catch((e: unknown) => console.warn('[audio] narrator playback failed', e));
    return () => {
      alive = false;
      if (speakingTimeout) clearTimeout(speakingTimeout);
    };
  }, [audioPath, audioNonce, player]);

  useEffect(() => {
    if (!sfxCueKeys.length) return;
    const timeout = setTimeout(() => clearSfxCueKeys(sfxCueNonce), 2600);
    return () => clearTimeout(timeout);
  }, [clearSfxCueKeys, sfxCueKeys, sfxCueNonce]);

  const stopRecording = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const started = await starting.current;
    starting.current = null;
    if (!started) return;
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) return;
      const file = new File(uri);
      const base64 = await file.base64();
      try {
        file.delete();
      } catch {
        // best effort: cache dir is cleaned by the OS anyway
      }
      console.log('[voice] recorded', uri, Math.round((base64.length * 3) / 4), 'bytes');
      await say({ audio: { mimeType: 'audio/mp4', base64 } });
    } catch (e) {
      console.warn('[voice] recording failed', e);
      setMicError(e instanceof Error ? e.message : String(e));
    }
  };

  const startRecording = () => {
    setMicError(null);
    player.pause();
    starting.current = (async () => {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setMicError('Microphone permission is needed to talk. You can type instead.');
        return false;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      timer.current = setTimeout(stopRecording, MAX_MS);
      return true;
    })().catch((e: unknown) => {
      setMicError(e instanceof Error ? e.message : String(e));
      return false;
    });
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    say({ text: t });
  };

  const subtitle = lines.find((line) => line.who === 'narrator' || line.who === 'world');
  const active = recording || busy !== null || speaking;

  return (
    <Panel color={SEA} style={s.panel}>
      <View style={s.panelHeading}>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{title}</Text>
          <Text style={s.prompt}>YOUR SHIP&apos;S SPIRIT · ASK OR GIVE A COMMAND</Text>
        </View>
        {busy === 'gm' ? <Text style={s.busyPill}>SEARCHING THE SEA</Text> : null}
      </View>

      <View style={s.subtitle}>
        <View style={s.subtitleHeading}>
          <View style={s.subtitleDot} />
          <Text style={s.subtitleLabel}>{subtitle?.who === 'world' ? 'WORLD DISPATCH' : 'LIVE SUBTITLE · TIDEKEEPER'}</Text>
          {subtitle?.who === 'world' && subtitle.sources?.[0] ? (
            <Text
              style={s.source}
              onPress={() => Linking.openURL(subtitle.sources![0]!.url)}
              numberOfLines={1}
            >
              ↗ EXA
            </Text>
          ) : null}
        </View>
        <Text style={s.subtitleText} numberOfLines={3}>
          {subtitle?.text ?? 'The tide is quiet. Hold the medallion and ask me about your voyage.'}
        </Text>
        {subtitle?.who === 'world' && subtitle.sources?.[0] ? (
          <Text style={s.sourceTitle} numberOfLines={1} onPress={() => Linking.openURL(subtitle.sources![0]!.url)}>
            LORE SOURCE · {subtitle.sources[0].title}
          </Text>
        ) : null}
      </View>

      <View style={s.voiceSection}>
        <PulseBars active={active} />
        <Pressable
          onPressIn={startRecording}
          onPressOut={stopRecording}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Listening. Release to send.' : 'Hold to talk to the Tidekeeper'}
          style={({ pressed }) => [s.medallion, recording && s.medallionListening, pressed && { transform: [{ scale: 0.96 }] }, busy !== null && { opacity: 0.65 }]}
        >
          <Sprite name="t_anchor" size={34} />
          <Text style={s.micGlyph}>MIC</Text>
        </Pressable>
        <PulseBars active={active} />
      </View>
      <Text style={s.voiceStatus}>
        {recording ? 'LISTENING · RELEASE TO SEND' : busy ? (busy === 'gm' ? 'CONSULTING THE CHARTS…' : 'THE TIDEKEEPER IS SPEAKING…') : 'HOLD TO TALK'}
      </Text>

      {sfxCueKeys.length ? (
        <View style={s.sfxRow}>
          {sfxCueKeys.slice(0, 3).map((key) => (
            <View key={key} style={s.sfxBadge}>
              <Text style={s.sfxText}>♪ {key.split('.').pop()?.replace(/_/g, ' ').toUpperCase()}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Row gap={8} style={{ flexWrap: 'nowrap' }}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="Or type: “how many Moves?”"
          placeholderTextColor="#8D9AA3"
          style={s.input}
          maxLength={200}
          returnKeyType="send"
        />
        <Btn small label="SEND" color={BRASS} onPress={send} disabled={!text.trim() || busy !== null} />
      </Row>

      <Btn
        small
        label={busy === 'gm' ? 'SEARCHING LIVE LORE…' : 'SUMMON AN AI WORLD EVENT'}
        icon={<Sprite name="fx_storm" size={22} />}
        color="#24394A"
        onPress={worldEvent}
        busy={busy === 'gm'}
        disabled={busy !== null}
      />
      {error || micError ? <Text style={s.error}>⚠ {micError ?? error}</Text> : null}
    </Panel>
  );
}

function PulseBars({ active }: { active: boolean }) {
  const [values] = useState(() => Array.from({ length: 5 }, () => new Animated.Value(0)));

  useEffect(() => {
    if (!active) {
      values.forEach((value) => value.setValue(0));
      return;
    }

    const loops = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 90),
          Animated.timing(value, { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [active, values]);

  return (
    <View style={s.pulseBars}>
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            s.pulseBar,
            {
              transform: [
                {
                  scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [0.28, 1] }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  panel: { padding: 10, gap: 7, borderWidth: 1, borderColor: BRASS, borderRadius: 16 },
  panelHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: F.title, fontSize: 21, letterSpacing: 1.5, color: PARCHMENT },
  prompt: { fontFamily: F.bodyBold, fontSize: 8, letterSpacing: 0.7, color: '#A8B1B6' },
  busyPill: { fontFamily: F.bodyBold, fontSize: 8, letterSpacing: 0.5, color: SEA, backgroundColor: BRASS, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 99 },
  subtitle: { paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: BRASS, borderRadius: 11, backgroundColor: PARCHMENT, gap: 3 },
  subtitleHeading: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  subtitleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1E7A58' },
  subtitleLabel: { flex: 1, fontFamily: F.bodyBold, fontSize: 8, letterSpacing: 1.2, color: '#53606A' },
  subtitleText: { fontFamily: F.bodyBold, fontSize: 13, lineHeight: 17, color: SEA },
  source: { fontFamily: F.bodyBold, fontSize: 9, color: '#6C4A11', textDecorationLine: 'underline' },
  sourceTitle: { fontFamily: F.bodyBold, fontSize: 9, color: '#6C4A11' },
  voiceSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 64 },
  medallion: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#13283A', borderWidth: 2, borderColor: BRASS },
  medallionListening: { backgroundColor: '#5D2A2A', borderColor: '#E98A70' },
  micGlyph: { position: 'absolute', bottom: 3, fontFamily: F.bodyBold, fontSize: 7, letterSpacing: 1, color: PARCHMENT },
  pulseBars: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 3 },
  pulseBar: { width: 3, height: 25, borderRadius: 2, backgroundColor: BRASS },
  voiceStatus: { alignSelf: 'center', fontFamily: F.bodyBold, fontSize: 8, letterSpacing: 1.5, color: BRASS },
  sfxRow: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  sfxBadge: { backgroundColor: '#24394A', borderWidth: 1, borderColor: BRASS, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  sfxText: { fontFamily: F.bodyBold, fontSize: 8, letterSpacing: 0.5, color: PARCHMENT },
  error: { fontFamily: F.bodyBold, fontSize: 11, color: '#F1A18B' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: BRASS,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: F.body,
    fontSize: 12,
    backgroundColor: PARCHMENT,
    color: SEA,
    minHeight: 36,
  },
});
