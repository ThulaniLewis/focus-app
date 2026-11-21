// Sign-in card and the text field style, shared by Today and Settings.
import React, { useState } from 'react';
import { TextInput } from 'react-native';
import { useStore } from '../lib/store';
import { font, radius, space, useColors } from '../lib/theme';
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
          fontSize: 16,
        },
        props.style,
      ]}
    />
  );
}

export function AccountCard() {
  const { user, sendCode, verifyCode, signOut, linkError, sync } = useStore();
  const c = useColors();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (user) {
    return (
      <Card>
        <T v="body">Signed in as {user}</T>
        <T v="caption" muted>Claude is reached through your Supabase function. No API key is stored on this phone.</T>
        <T v="caption" color={sync.state === 'error' ? c.nudgeInk : undefined} muted={sync.state !== 'error'}>
          {sync.state === 'ok'
            ? `Synced with your other devices at ${new Date(sync.at).toTimeString().slice(0, 5)}. Just for me, Money and sleep stay on this phone.`
            : sync.state === 'syncing'
              ? 'Syncing…'
              : sync.state === 'error'
                ? sync.message
                : 'Sync starts once you are signed in.'}
        </T>
        <Button small kind="quiet" label="Sign out" onPress={signOut} style={{ alignSelf: 'flex-start' }} />
      </Card>
    );
  }
  return (
    <Card>
      {!sent ? (
        <>
          <T v="body" muted>Sign in once with your email. You'll get an email with a sign-in link.</T>
          <Field value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
          <Button
            label={busy ? 'Sending…' : 'Send sign-in email'}
            disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}
            onPress={async () => {
              setBusy(true);
              setMsg(null);
              const err = await sendCode(email);
              setBusy(false);
              if (err) setMsg(err);
              else setSent(true);
            }}
          />
        </>
      ) : (
        <>
          <T v="body">Email sent to {email.trim()}. Open it on this phone and tap Sign in. It brings you straight back here. If the email has a code instead, type it below.</T>
          <Field value={code} onChangeText={setCode} placeholder="123456" keyboardType="number-pad" maxLength={8} style={{ textAlign: 'center', fontSize: 22, letterSpacing: 4 }} />
          <Button
            label={busy ? 'Checking…' : 'Sign in'}
            disabled={busy || code.trim().length < 6}
            onPress={async () => {
              setBusy(true);
              setMsg(null);
              const err = await verifyCode(email, code);
              setBusy(false);
              if (err) setMsg(err);
            }}
          />
          <Button small kind="quiet" label="Use a different email" onPress={() => { setSent(false); setCode(''); }} />
        </>
      )}
      {msg || linkError ? <T v="label" color={c.nudgeInk}>{msg ?? `That link didn't work: ${linkError}. Send a new one.`}</T> : null}
    </Card>
  );
}
