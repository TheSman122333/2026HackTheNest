import { Btn, C, H, P, Panel, Row } from '@/components/kit';
import { useNarrator } from '@/features/narrator/useNarrator';
import { useGameAudio } from '@/state/gameAudio';

export function SoundSettings() {
  const { musicEnabled, effectsEnabled, musicStatus, effectsStatus, unlocked, toggleMusic, toggleEffects, retry, unlock } = useGameAudio();
  const { muted, toggleMute } = useNarrator();
  const loading = musicStatus === 'loading' || effectsStatus === 'loading';
  const failed = musicStatus === 'unavailable' || effectsStatus === 'unavailable';
  return <Panel>
    <H>Voyage audio</H>
    <P dim>Original music and effects from ElevenLabs. Music stays low and becomes quieter during narration.</P>
    <Row>
      <Btn small label={musicEnabled ? 'Music on' : 'Music off'} color={musicEnabled ? C.sky : C.cloud} onPress={toggleMusic} />
      <Btn small label={effectsEnabled ? 'Effects on' : 'Effects off'} color={effectsEnabled ? C.sky : C.cloud} onPress={toggleEffects} />
      <Btn small label={muted ? 'Voice off' : 'Voice on'} color={muted ? C.cloud : C.sky} onPress={toggleMute} />
    </Row>
    <P dim>The narrator gives three short first-visit tips. Moves, attacks, and quest completions use visual feedback instead of a voice line.</P>
    {!unlocked ? <Btn small label="Enable game audio" onPress={unlock} /> : null}
    {loading ? <P dim>Preparing the soundtrack. The game is ready to play while audio loads.</P> : null}
    {failed ? <><P dim>Audio is unavailable right now. Keep playing and try again later.</P><Btn small label="Retry audio" color={C.sky} onPress={retry} /></> : null}
  </Panel>;
}
