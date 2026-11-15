import { LocalizedText as Text } from '@/features/language/LocalizedText';
import { LocalizedPressable as Pressable, LocalizedTextInput as TextInput } from '@/features/language/LocalizedControls';
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
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Btn, C, F, P, Panel, Row, Tag } from '@/components/kit';
import { Sprite } from '@/components/sprites';
import { fetchAudio } from '@/lib/audio';
import { cleanText } from '@/ui/text';

import { useNarrator } from './useNarrator';

const MAX_MS = 15_000;
/** Browsers only allow the mic on https; the Safari build over LAN types instead. */
const CAN_TALK = Platform.OS !== 'web';
const title = `The ${NARRATOR.name}`;

export function NarratorPanel() {
  const { lines, busy, error, audioPath, audioNonce, briefing, say, worldEvent } = useNarrator();
  const player = useAudioPlayer(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
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
    fetchAudio(audioPath, `narrator-${audioNonce}`)
      .then((uri) => {
        if (!alive) return;
        player.replace({ uri });
        player.play();
      })
      .catch((e: unknown) => console.warn('[audio] narrator playback failed', e));
    return () => {
      alive = false;
      player.pause();
    };
  }, [audioPath, audioNonce, player]);

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

  return (
    <Panel color={C.deep}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={10} style={{ flex: 1, minWidth: 180, flexWrap: 'nowrap' }}>
          <View style={{ flexShrink: 1 }}>
            <Text style={s.name}>{title}</Text>
            <P dim>Ask about your Moves, the boss, or say “strike”.</P>
          </View>
        </Row>
        {busy ? <Tag label={busy === 'gm' ? 'SEARCHING…' : 'LISTENING…'} color={C.orange} /> : null}
      </Row>

      {lines.slice(0, 4).map((l, i) => (
        <View key={l.id} style={[s.bubble, l.who === 'you' ? s.you : l.who === 'world' ? s.world : s.narr, i > 0 && { opacity: 0.75 }]}>
          <Text translatable={false} style={s.bubbleText}>
            {cleanText(l.text)}
          </Text>
          {l.sources?.length ? (
            <View style={{ marginTop: 4, gap: 2 }}>
              {l.sources.map((src) => (
                <Text key={src.url} style={s.source} onPress={() => Linking.openURL(src.url)} numberOfLines={1}>
                  Source: {cleanText(src.title)}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ))}

      {CAN_TALK ? (
      <Pressable
        onPressIn={startRecording}
        onPressOut={stopRecording}
        disabled={busy !== null}
        accessibilityRole="button"
        accessibilityLabel="Hold to talk to the Tidekeeper"
        style={({ pressed }) => [s.talk, recording && { backgroundColor: C.red }, busy !== null && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }] }]}
      >
        <Text style={s.talkText}>{recording ? 'Recording… release to send' : 'Hold to talk'}</Text>
      </Pressable>
      ) : null}

      <Row gap={8} style={{ flexWrap: 'nowrap' }}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="…or type: “how many moves?”"
          placeholderTextColor={C.dimDark}
          style={s.input}
          maxLength={200}
          returnKeyType="send"
        />
        <Btn small label="Send" color={C.sky} onPress={send} disabled={!text.trim() || busy !== null} />
      </Row>

      <Btn
        small
        label="Summon a world event"
        icon={<Sprite name="fx_storm" size={22} />}
        color={C.peri}
        onPress={worldEvent}
        busy={busy === 'gm'}
        disabled={busy !== null}
      />
      {error || micError ? <P color={C.gold}>{micError ?? error}</P> : null}
    </Panel>
  );
}

const s = StyleSheet.create({
  name: { fontFamily: F.title, fontSize: 28, color: C.gold },
  bubble: { borderWidth: 1, borderColor: '#D8D3C8', borderRadius: 12, padding: 14 },
  narr: { backgroundColor: C.cloud },
  you: { backgroundColor: '#C4D5D4', alignSelf: 'flex-end' },
  world: { backgroundColor: C.gold },
  bubbleText: { fontFamily: F.body, fontSize: 14, color: C.ink, lineHeight: 20 },
  source: { fontFamily: F.bodyBold, fontSize: 12, color: C.navy, textDecorationLine: 'underline' },
  talk: {
    backgroundColor: C.orange,
    borderWidth: 1,
    borderColor: C.orange,
    borderRadius: 10,
    paddingVertical: 14,
    minHeight: 50,
    alignItems: 'center',
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  talkText: { fontFamily: F.uiBold, fontSize: 15, color: C.ink },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D8D3C8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 48,
    fontFamily: F.body,
    fontSize: 14,
    backgroundColor: C.cloud,
    color: C.ink,
  },
});
