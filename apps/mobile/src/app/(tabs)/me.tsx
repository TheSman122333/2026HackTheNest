/** Your pirate: skills, Legend, streaks, scroll limits, tracking setup. */
import { SKILLS, STREAK, type Skill } from '@last-voyage/game';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Bar, Btn, C, H, P, Panel, Row, Screen, Stat, Title } from '@/components/kit';
import { avatarFor, Sprite } from '@/components/sprites';
import { api } from '@/lib/api';
import { useSession } from '@/state/session';

const SKILL_LABEL: Record<Skill, string> = {
  grit: '💪 Grit',
  charm: '😎 Charm',
  lore: '📚 Lore',
  craft: '🔨 Craft',
  seacraft: '🧭 Seacraft',
};

const ROLE: Record<Skill, string> = {
  grit: 'Bosun',
  charm: 'Silver-tongue',
  lore: 'Navigator',
  craft: 'Shipwright',
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
        <Sprite name={avatarFor(u.id)} size={96} />
        <View style={{ flexShrink: 1 }}>
          <Title>{u.name.toUpperCase()}</Title>
          <P dim>{ROLE[top]} of the {me.crew?.name}</P>
        </View>
      </Row>

      <Row gap={10}>
        <Stat label="LEGEND" value={`⭐${u.legend}`} />
        <Stat label="CALM DAYS" value={`🔥${st.calmDays}`} color={C.cloud} />
        <Stat label="BEST" value={st.best} color={C.cloud} />
        <Stat label="SHIELDS" value={`🛡️${st.shields}/${STREAK.maxShields}`} color={C.cloud} />
      </Row>

      <Panel>
        <H>Skills</H>
        {SKILLS.map((k) => (
          <Bar key={k} value={u.skills[k]} max={100} color={C.sky} label={`${SKILL_LABEL[k]} ${u.skills[k]}`} />
        ))}
        <P dim>Skills grow from real activities and power you up in boss fights.</P>
      </Panel>

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
