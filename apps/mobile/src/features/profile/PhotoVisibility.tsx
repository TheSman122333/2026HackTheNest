/** "Show my photo to other players": on = crewmates and leaderboards see your face; off = drawn pirate. */
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { C, P, Row } from '@/components/kit';
import { api } from '@/lib/api';
import { useSession } from '@/state/session';

export function PhotoVisibility() {
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const on = me.user.photoPublic !== false;
  const toggle = async (value: boolean) => {
    setBusy(true);
    try {
      await api('PUT', '/me/photo-visibility', { public: value });
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
      <View style={{ flex: 1 }}>
        <P>Show my photo to other players</P>
        <P dim>{on ? 'Crewmates and leaderboards see your face.' : 'Others see your drawn pirate. Your devices still show your photo.'}</P>
      </View>
      <Switch value={on} disabled={busy} onValueChange={toggle} accessibilityLabel="Show my photo to other players"
        trackColor={{ true: C.green, false: C.fog }} thumbColor={C.cloud} />
    </Row>
  );
}
