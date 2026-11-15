/** Your pirate: skills, Honor, streaks, scroll limits, tracking setup. */
import { SKILLS, STREAK, type Skill } from '@last-voyage/game';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Bar, Btn, C, H, P, Panel, Row, Screen, Stat } from '@/components/kit';
import { TRACKING } from '@/lib/platform';
import { Sprite } from '@/components/sprites';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ThemeSongCard } from '@/features/music/ThemeSongCard';
import { SoundSettings } from '@/features/audio/SoundSettings';
import { LeaveCrew } from '@/features/crew/LeaveCrew';
import { EditName } from '@/features/profile/EditName';
import { HONOR_SUMMARY, LegendHelp } from '@/features/legend/LegendHelp';
import { api } from '@/lib/api';
import { useSession } from '@/state/session';
import { Float } from '@/ui/motion';

const SKILL_LABEL: Record<Skill, string> = {
  grit: 'Grit',
  charm: 'Charm',
  lore: 'Lore',
  craft: 'Craft',
  seacraft: 'Seacraft',
};

const ROLE: Record<Skill, string> = {
  grit: 'Bosun',
  charm: 'Silver-tongue',
  lore: 'Navigator',
  craft: 'Carpenter',
  seacraft: 'Quartermaster',
};

export default function Me() {
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const logout = useSession((s) => s.logout);
  const [saving, setSaving] = useState(false);
  if (!me) return null;
  const u = me.user;
  const st = me.today.streak;
  const top = [...SKILLS].sort((a, b) => u.skills[b] - u.skills[a])[0]!;

  const setLimits = async (swipes: number, minutes: number) => {
    setSaving(true);
    try {
      await api('PUT', '/me/limits', { swipes, minutes });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Row gap={12} style={{ flexWrap: "nowrap" }}>
        <Float amplitude={3} tilt={2}><PlayerAvatar userId={u.id} avatarId={u.avatarId} size={96} /></Float>
        <View style={{ flexShrink: 1 }}>
          <EditName />
          <P dim>{ROLE[top]} of the {me.crew?.name}</P>
        </View>
      </Row>

      <Btn label="Customize your pirate" color={C.indigo} onPress={() => router.push('/avatar')} />
      <Btn label="Quest preferences" color={C.sky} onPress={() => router.push('/preferences')} />

      <Panel color={C.deep}>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <Row gap={8} style={{ flexWrap: 'nowrap' }}><Sprite name="t_star" size={26} /><H>{u.legend} Honor</H></Row>
          <LegendHelp />
        </Row>
        <P dim>{HONOR_SUMMARY} Earn it from real-life activities and boss fights. Your crew&apos;s Honor together is your ship&apos;s, and the top ship claims the one Lodestar.</P>
        <Btn small label="Honor leaderboard" color={C.gold} onPress={() => router.push('/legend')} />
      </Panel>

      <Row gap={10}>
        {TRACKING ? (<>
          <Stat label="CALM DAYS" value={st.calmDays} color={C.cloud} />
          <Stat label="BEST" value={st.best} color={C.cloud} />
          <Stat label="SHIELDS" value={`${st.shields}/${STREAK.maxShields}`} color={C.cloud} />
        </>) : null}
      </Row>

      <SoundSettings />
      <ThemeSongCard />

      <Panel>
        <H>Skills</H>
        {SKILLS.map((k) => (
          <Bar key={k} value={u.skills[k]} max={100} color={C.sky} label={`${SKILL_LABEL[k]} ${u.skills[k]}`} />
        ))}
        <P dim>Skills grow from real activities and power you up in boss fights.</P>
      </Panel>

      {TRACKING ? (<>
      <Panel>
        <H>Streak bonus: ×{(1 + Math.min(st.calmDays, STREAK.calmMaxDays) * STREAK.calmStepBonus + (st.shoreLeaveBonus ? STREAK.shoreLeaveBonus : 0)).toFixed(2)}</H>
        <P>+10% Moves for every calm day in a row (max ×2). A Streak Shield every 7 days saves you once. A day without opening the apps gives +25% tomorrow.</P>
      </Panel>

      <Panel>
        <H>My daily short-form limit</H>
        <P>
          {u.limits.swipes} swipes · {u.limits.minutes} minutes
        </P>
        <Row>
          <Btn small label="Stricter" color={C.green} busy={saving} onPress={() => setLimits(Math.max(0, u.limits.swipes - 10), Math.max(0, u.limits.minutes - 5))} />
          <Btn small label="Looser" color={C.cloud} busy={saving} onPress={() => setLimits(u.limits.swipes + 10, u.limits.minutes + 5)} />
        </Row>
      </Panel>

      <Panel>
        <H>Tracking</H>
        <P dim>Set up scroll tracking and step access, and see live counts.</P>
        <Btn small label="Open Scroll Lab" onPress={() => router.push('/dev/scroll-lab')} />
      </Panel>
      </>) : null}

      <LeaveCrew />

      <Btn
        label="Log out"
        color={C.cloud}
        onPress={async () => {
          await logout();
          router.replace('/welcome');
        }}
      />
    </Screen>
  );
}
