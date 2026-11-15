import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Btn, C, H, P, Panel, Screen, Title } from '@/components/kit';
import { ssojetConfigured } from '@/features/auth/ssojet';
import { inviteCode, usePendingInvite } from '@/features/invites/pending';
import { api } from '@/lib/api';
import type { Crew } from '@/lib/types';
import { useSession } from '@/state/session';

export default function JoinScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const raw = Array.isArray(params.code) ? params.code[0] : params.code;
  const incoming = inviteCode(raw);
  const { ready, code, hydrate, remember, clear } = usePendingInvite();
  const { token, me } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [resolvedIncoming, setResolvedIncoming] = useState<string | null | undefined>(undefined);
  const [retrying, setRetrying] = useState(false);
  const [joining, setJoining] = useState(false);
  const [rememberFailed, setRememberFailed] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  const persisting = retrying || Boolean(incoming && incoming !== resolvedIncoming);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    void (incoming ? remember(incoming) : hydrate()).then(() => {
      if (alive) { setRememberFailed(false); setError(null); }
    }).catch(() => {
      if (alive) {
        usePendingInvite.setState({ ready: true });
        setRememberFailed(true);
        setError('This device could not remember the invite. Keep the code and enter it after signing in.');
      }
    }).finally(() => { if (alive) setResolvedIncoming(incoming); });
    return () => { alive = false; };
  }, [incoming, hydrate, remember]);

  const activeCode = incoming ?? code;
  const retryRemember = async () => {
    if (!activeCode || locked.current) return;
    locked.current = true;
    setRetrying(true);
    try {
      await remember(activeCode);
      if (mounted.current) { setRememberFailed(false); setError(null); }
    } catch { if (mounted.current) setError('This device still cannot save the invitation. Keep the code and try again.'); }
    finally { locked.current = false; if (mounted.current) setRetrying(false); }
  };
  const leave = async () => {
    if (joining) return;
    const viewer = useSession.getState().me?.user.id;
    const canLeave = () => mounted.current && useSession.getState().me?.user.id === viewer;
    try { await clear(); if (canLeave()) router.replace('/'); }
    catch {
      // A blocked device store must not trap the player on an already accepted/declined invite.
      usePendingInvite.setState({ ready: true, code: null });
      if (canLeave()) router.replace('/');
    }
  };
  const join = async () => {
    if (!activeCode || !me || me.crew || locked.current || rememberFailed) return;
    locked.current = true;
    setJoining(true);
    setError(null);
    const userId = me.user.id;
    const isCurrent = () => mounted.current && useSession.getState().me?.user.id === userId;
    try {
      const result = await api<{ crew: Crew }>('POST', '/crews/join', { code: activeCode });
      if (!isCurrent()) return;
      const current = useSession.getState().me!;
      // Joining already succeeded. Keep that fact even if the subsequent refresh or local cleanup fails.
      useSession.getState().setMe({ crew: result.crew, user: { ...current.user, crewId: result.crew.id } });
      if (usePendingInvite.getState().code === activeCode) await clear();
      if (!isCurrent()) return;
      router.replace('/');
    } catch (e) { if (isCurrent()) setError(e instanceof Error ? e.message : 'Could not join this crew. Please try again.'); }
    finally { locked.current = false; if (isCurrent()) setJoining(false); }
  };

  if (!ready || persisting) return <Screen><ActivityIndicator color={C.cloud} /><P>Opening your crew invitation...</P></Screen>;
  if (raw !== undefined && !incoming || !activeCode) return <Screen><Title>Invitation not found</Title><P>Use the QR code or six-character invite code shared by your friend.</P><Btn label="Continue" onPress={() => router.replace('/')} /></Screen>;

  return <Screen>
    <Title>A place on the crew</Title>
    <Panel><H>Invite code: {activeCode}</H><P>One ship. One island. A voyage you earn together.</P></Panel>
    {error ? <Panel color={C.deep}><P>{error}</P></Panel> : null}
    {rememberFailed ? <Btn label="Retry saving invitation" onPress={retryRemember} /> : null}
    {!token || !me ? <>
      <P>{ssojetConfigured ? 'Sign in with SSOJet to accept this invitation. Your code will wait while you board.' : 'Sign in to accept this invitation. Your code will wait while you board.'}</P>
      <Btn label="Sign in to join" onPress={() => router.push('/welcome')} disabled={rememberFailed} />
    </> : !me.user.avatarId ? <>
      <P>Choose your pirate and optionally add a face photo first. Your invitation is saved.</P>
      <Btn label="Choose my pirate" onPress={() => router.replace({ pathname: '/avatar', params: { onboarding: '1' } })} disabled={rememberFailed} />
    </> : !me.user.preferences?.completedAt ? <>
      <P>First, tell us what you enjoy so your quests fit your day. Your invitation is saved.</P>
      <Btn label="Set my quest preferences" onPress={() => router.replace('/preferences')} disabled={rememberFailed} />
    </> : me.crew ? <>
      <H>{me.crew.inviteCode === activeCode ? 'You are already aboard' : 'You already have a crew'}</H>
      <P>{me.crew.inviteCode === activeCode ? `You are sailing with ${me.crew.name}.` : `You are sailing with ${me.crew.name}. This invitation will not move you out of your current crew.`}</P>
      <Btn label="Return to my ship" onPress={leave} disabled={joining} />
    </> : <>
      <P>Ready to join your friend&apos;s crew? Confirm below to come aboard.</P>
      <Btn label="Join this crew" onPress={join} busy={joining} disabled={rememberFailed} />
    </>}
    {!me?.crew ? <Btn small label="Decline invitation" color={C.deep} onPress={leave} disabled={joining} /> : null}
  </Screen>;
}
