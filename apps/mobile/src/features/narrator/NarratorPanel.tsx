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
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Btn, C, F, H, P, Panel, Row, Tag } from '@/components/kit';
import { Sprite } from '@/components/sprites';
import { authedSource } from '@/lib/api';

import { useNarrator } from './useNarrator';

const MAX_MS = 15_000;
const title = NARRATOR.name.toUpperCase();

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
    authedSource(audioPath).then((src) => {
      if (!alive) return;
      player.replace(src);
      player.play();
    });
    return () => {
      alive = false;
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
      await say({ audio: { mimeType: 'audio/mp4', base64 } });
    } catch (e) {
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
    <Panel color={C.indigo}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Row gap={10} style={{ flexShrink: 1, flexWrap: 'nowrap' }}>
          <View style={s.portrait}>
            <Sprite name="b_turtle" size={56} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <H>{title}</H>
            <P dim>Ask about your Moves, the boss, or say “strike”.</P>
          </View>
        </Row>
        {busy ? <Tag label={busy === 'gm' ? 'SEARCHING…' : 'LISTENING…'} color={C.orange} /> : null}
      </Row>

      {lines.slice(0, 4).map((l, i) => (
        <View key={l.id} style={[s.bubble, l.who === 'you' ? s.you : l.who === 'world' ? s.world : s.narr, i > 0 && { opacity: 0.75 }]}>
          <Text style={[s.bubbleText, l.who === 'you' && { color: C.white }]}>
            {l.who === 'world' ? '🌍 ' : ''}
            {l.text}
          </Text>
          {l.sources?.length ? (
            <View style={{ marginTop: 4, gap: 2 }}>
              {l.sources.map((src) => (
                <Text key={src.url} style={s.source} onPress={() => Linking.openURL(src.url)} numberOfLines={1}>
                  ↗ {src.title}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ))}

      <Pressable
        onPressIn={startRecording}
        onPressOut={stopRecording}
        disabled={busy !== null}
        style={[s.talk, recording && { backgroundColor: C.red }, busy !== null && { opacity: 0.5 }]}
      >
        <Text style={s.talkText}>{recording ? '● Recording… release to send' : '🎙️ Hold to talk'}</Text>
      </Pressable>

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
        label="Summon a world event (AI Game Master)"
        icon={<Sprite name="fx_storm" size={22} />}
        color={C.peri}
        onPress={worldEvent}
        busy={busy === 'gm'}
        disabled={busy !== null}
      />
      {error || micError ? <P color={C.gold}>⚠️ {micError ?? error}</P> : null}
    </Panel>
  );
}

const s = StyleSheet.create({
  portrait: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.navy, borderWidth: 3, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  bubble: { borderWidth: 2, borderColor: C.ink, borderRadius: 14, padding: 10 },
  narr: { backgroundColor: C.cloud, borderTopLeftRadius: 4 },
  you: { backgroundColor: C.sky, alignSelf: 'flex-end', borderTopRightRadius: 4 },
  world: { backgroundColor: C.gold },
  bubbleText: { fontFamily: F.body, fontSize: 14, color: C.ink, lineHeight: 20 },
  source: { fontFamily: F.bodyBold, fontSize: 12, color: C.navy, textDecorationLine: 'underline' },
  talk: {
    backgroundColor: C.orange,
    borderWidth: 3,
    borderColor: C.ink,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  talkText: { fontFamily: F.ui, fontSize: 17, color: C.ink },
  input: {
    flex: 1,
    borderWidth: 3,
    borderColor: C.ink,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: F.body,
    fontSize: 14,
    backgroundColor: C.cloud,
    color: C.ink,
  },
});
