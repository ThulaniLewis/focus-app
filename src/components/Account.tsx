// Sign-in card and the text field style, shared by Today and Settings. Three ways in: an email code
// (or the link in the same email), or email and password. Accounts are never created from here.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { useStore } from '../lib/store';
import { font, radius, space, type, useColors } from '../theme';
import { Button, Card, T } from './ui';

export function Field(props: React.ComponentProps<typeof TextInput>) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.inkMuted}
      {...props}
      style={[
        {
          minHeight: 48,
          backgroundColor: c.surfaceSunken,
          borderRadius: radius.sm,
          paddingHorizontal: space[3],
          color: c.ink,
          fontFamily: font.body,
          fontSize: type.body.fontSize,
        },
        props.style,
      ]}
    />
  );
}

const EMAIL_KEY = 'focus.lastEmail';
export const validEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

/** The sign-in steps, shared by the phone's card and the tablet's panel. Nothing here draws anything. */
export function useAccountFlow() {
  const { user, sendCode, verifyCode, signInWithPassword, setPassword, signOut, linkError, sync } = useStore();
  const [mode, setMode] = useState<'code' | 'password'>('code');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPw] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Her email is remembered on this device (not a secret), so signing in again is one step.
  useEffect(() => {
    AsyncStorage.getItem(EMAIL_KEY).then((e) => e && setEmail((cur) => cur || e)).catch(() => {});
  }, []);
  const remember = () => AsyncStorage.setItem(EMAIL_KEY, email.trim().toLowerCase()).catch(() => {});
  const run = async (job: () => Promise<string | null>, after?: () => void) => {
    setBusy(true);
    setMsg(null);
    const err = await job();
    setBusy(false);
    if (err) setMsg(err);
    else after?.();
  };
  return {
    user, sync, linkError, signOut,
    mode, setMode: (m: 'code' | 'password') => { setMode(m); setMsg(null); },
    email, setEmail, code, setCode, password, setPw, sent, busy, msg, setMsg,
    sendEmail: () => run(() => sendCode(email), () => { remember(); setSent(true); }),
    checkCode: () => run(() => verifyCode(email, code), remember),
    passwordIn: () => run(() => signInWithPassword(email, password), () => { remember(); setPw(''); }),
    changeEmail: () => { setSent(false); setCode(''); },
    setNewPassword: (pw: string, done: () => void) => run(() => setPassword(pw), done),
  };
}

export function syncLine(sync: ReturnType<typeof useStore>['sync'], phone: boolean): string {
  if (sync.state === 'ok') return `Synced with your other devices at ${new Date(sync.at).toTimeString().slice(0, 5)}.${phone ? ' Just for me, Money and sleep stay on this phone.' : ''}`;
  if (sync.state === 'syncing') return 'Syncing…';
  if (sync.state === 'error') return sync.message;
  return 'Sync starts once you are signed in.';
}

export function AccountCard() {
  const a = useAccountFlow();
  const c = useColors();
  const [newPw, setNewPw] = useState('');
  const [settingPw, setSettingPw] = useState(false);

  if (a.user) {
    return (
      <Card>
        <T v="body">Signed in as {a.user}</T>
        <T v="caption" muted>Claude is reached through your Supabase function. No API key is stored on this phone.</T>
        <T v="caption" color={a.sync.state === 'error' ? c.nudgeInk : undefined} muted={a.sync.state !== 'error'}>{syncLine(a.sync, true)}</T>
        {settingPw ? (
          <>
            <T v="caption" muted>Set a password so you can sign in on the tablet without an email. At least 8 characters.</T>
            <Field value={newPw} onChangeText={setNewPw} placeholder="New password" secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <Button
              label={a.busy ? 'Saving…' : 'Save password'}
              disabled={a.busy || newPw.length < 8}
              onPress={() => a.setNewPassword(newPw, () => { setNewPw(''); setSettingPw(false); a.setMsg('Password saved. You can use it to sign in on the tablet.'); })}
            />
            <Button small kind="quiet" label="Cancel" onPress={() => { setSettingPw(false); setNewPw(''); }} style={{ alignSelf: 'flex-start' }} />
          </>
        ) : (
          <Button small kind="soft" label="Set a password" onPress={() => { a.setMsg(null); setSettingPw(true); }} style={{ alignSelf: 'flex-start' }} />
        )}
        {a.msg ? <T v="label" color={a.msg.startsWith('Password saved') ? undefined : c.nudgeInk}>{a.msg}</T> : null}
        <Button small kind="quiet" label="Sign out" onPress={a.signOut} style={{ alignSelf: 'flex-start' }} />
      </Card>
    );
  }
  return (
    <Card>
      {a.mode === 'password' ? (
        <>
          <T v="body" muted>Sign in with your email and password. Set the password on your phone first (Settings, once you are signed in).</T>
          <Field value={a.email} onChangeText={a.setEmail} placeholder="you@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
          <Field value={a.password} onChangeText={a.setPw} placeholder="Password" secureTextEntry autoCapitalize="none" autoCorrect={false} />
          <Button label={a.busy ? 'Signing in…' : 'Sign in'} disabled={a.busy || !validEmail(a.email) || !a.password} onPress={a.passwordIn} />
          <Button small kind="quiet" label="Use an email code instead" onPress={() => a.setMode('code')} />
        </>
      ) : !a.sent ? (
        <>
          <T v="body" muted>Sign in once with your email. You'll get an email with a code and a sign-in link.</T>
          <Field value={a.email} onChangeText={a.setEmail} placeholder="you@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
          <Button label={a.busy ? 'Sending…' : 'Send sign-in email'} disabled={a.busy || !validEmail(a.email)} onPress={a.sendEmail} />
          <Button small kind="quiet" label="Use a password instead" onPress={() => a.setMode('password')} />
        </>
      ) : (
        <>
          <T v="body">Email sent to {a.email.trim()}. Type the code from it below, or tap the link in the email on this phone to come straight back here.</T>
          <Field value={a.code} onChangeText={a.setCode} placeholder="123456" keyboardType="number-pad" maxLength={8} style={{ textAlign: 'center', fontSize: 22, letterSpacing: 4 }} />
          <Button label={a.busy ? 'Checking…' : 'Sign in'} disabled={a.busy || a.code.trim().length < 6} onPress={a.checkCode} />
          <Button small kind="quiet" label="Use a different email" onPress={a.changeEmail} />
        </>
      )}
      {a.msg || a.linkError ? <T v="label" color={c.nudgeInk}>{a.msg ?? `That link didn't work: ${a.linkError}. Send a new one, or type the code from the email.`}</T> : null}
    </Card>
  );
}
