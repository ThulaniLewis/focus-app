// The tablet's Settings panel, built to "Tablet settings panel"
// (docs/design/improvements/project/TabletSettings.dc.html). Shared screen: nothing private here.
// Everything the tablet needs is on this panel, in Dash style: Look, which device this is, sign-in,
// the weather town and the feature switches. It never opens the phone's Settings layout.
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { syncLine, useAccountFlow, validEmail } from '../../components/Account';
import { Icon } from '../../components/Icon';
import { DashShell, L, useDash } from '../../components/TabletDash';
import { useDeviceRole } from '../../lib/device';
import { type DeviceRole, setDeviceRole } from '../../lib/deviceRole';
import { FEATURES, featureOn, switchFeature, type FeatureId } from '../../lib/features';
import { LOOKS } from '../../lib/look';
import { useStore } from '../../lib/store';
import { findTown } from '../../lib/weather';
import { font } from '../../theme';

/** Features that make sense on the shared screen (sleep is phone only). */
const TABLET_FEATURES: FeatureId[] = ['weather', 'punctuality'];

const APPS: { label: string; icon: string; open: () => Promise<unknown> }[] = [
  { label: 'Spotify', icon: 'music', open: () => Linking.openURL('spotify:') },
  { label: 'YouTube', icon: 'youtube', open: () => Linking.openURL('https://www.youtube.com') },
  { label: 'Outlook', icon: 'mail', open: () => Linking.openURL('ms-outlook://') },
  { label: 'Camera', icon: 'camera', open: () => Linking.sendIntent('android.media.action.STILL_IMAGE_CAMERA') },
];

function Row({ label, value, onPress, last }: { label: string; value?: string; onPress?: () => void; last?: boolean }) {
  const D = useDash();
  const body = (
    <View style={{ minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: D.line }}>
      <L size={20}>{label}</L>
      {value ? <L size={20} color={D.muted}>{value}</L> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}: ${value}. Tap to change` : label}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

function SwitchRow({ label, on, onChange, last }: { label: string; on: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  const D = useDash();
  return (
    <Pressable
      onPress={() => onChange(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{ minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: D.line }}
    >
      <L size={20}>{label}</L>
      <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: on ? D.primary : D.ghost, backgroundColor: on ? D.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Icon name="check" size={20} color={D.onPrimary} /> : null}
      </View>
    </Pressable>
  );
}

function DashField(props: React.ComponentProps<typeof TextInput>) {
  const D = useDash();
  return (
    <TextInput
      placeholderTextColor={D.muted}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      style={[{ minHeight: 64, backgroundColor: D.sunken, borderRadius: 16, paddingHorizontal: 20, color: D.ink, fontFamily: font.body, fontSize: 20 }, props.style]}
    />
  );
}

function DashButton({ label, onPress, disabled, ghost }: { label: string; onPress: () => void; disabled?: boolean; ghost?: boolean }) {
  const D = useDash();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={{ minHeight: 64, borderRadius: 16, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: ghost ? 'transparent' : D.primary, borderWidth: ghost ? 1 : 0, borderColor: D.ghost, opacity: disabled ? 0.5 : 1 }}
    >
      <L size={20} weight="strong" color={ghost ? D.ink : D.onPrimary}>{label}</L>
    </Pressable>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const D = useDash();
  return (
    <View style={{ gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: D.line }}>
      <L size={16} weight="strong" color={D.muted}>{title}</L>
      {children}
    </View>
  );
}

/** Which device this is: the phone or the kitchen tablet. Kept on this device only. */
function DeviceRoleRow() {
  const D = useDash();
  const role = useDeviceRole();
  const opts: { id: DeviceRole; label: string; about: string }[] = [
    { id: 'phone', label: 'This phone', about: 'Everything, including private spaces' },
    { id: 'tablet', label: 'Kitchen tablet', about: 'Shared screen: Just for me, Money and sleep hidden' },
  ];
  return (
    <Group title="This device">
      {opts.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => setDeviceRole(o.id)}
          accessibilityRole="radio"
          accessibilityState={{ checked: role === o.id }}
          accessibilityLabel={`${o.label}. ${o.about}`}
          style={{ minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 16, paddingHorizontal: 16, backgroundColor: role === o.id ? D.primarySoft : 'transparent', borderWidth: 1, borderColor: role === o.id ? D.primarySoft : D.line }}
        >
          <View style={{ flex: 1 }}>
            <L size={20} color={role === o.id ? D.primaryStrong : D.ink}>{o.label}</L>
            <L size={16} color={D.muted}>{o.about}</L>
          </View>
          {role === o.id ? <Icon name="check" size={24} color={D.primaryStrong} /> : null}
        </Pressable>
      ))}
    </Group>
  );
}

/** Sign in on the tablet: an email code (or the link), or email and password. Never creates an account. */
function AccountPanel() {
  const D = useDash();
  const a = useAccountFlow();
  return (
    <Group title="Account">
      {a.user ? (
        <>
          <L size={20}>{`Signed in as ${a.user}`}</L>
          <L size={16} color={a.sync.state === 'error' ? D.nudgeInk : D.muted}>{syncLine(a.sync, false)}</L>
          <DashButton ghost label="Sign out" onPress={a.signOut} />
        </>
      ) : a.mode === 'password' ? (
        <>
          <L size={16} color={D.muted}>Set the password on your phone first (Settings, once you are signed in).</L>
          <DashField value={a.email} onChangeText={a.setEmail} placeholder="you@example.com" keyboardType="email-address" />
          <DashField value={a.password} onChangeText={a.setPw} placeholder="Password" secureTextEntry />
          <DashButton label={a.busy ? 'Signing in…' : 'Sign in'} disabled={a.busy || !validEmail(a.email) || !a.password} onPress={a.passwordIn} />
          <DashButton ghost label="Use an email code instead" onPress={() => a.setMode('code')} />
        </>
      ) : !a.sent ? (
        <>
          <DashField value={a.email} onChangeText={a.setEmail} placeholder="you@example.com" keyboardType="email-address" />
          <DashButton label={a.busy ? 'Sending…' : 'Send sign-in email'} disabled={a.busy || !validEmail(a.email)} onPress={a.sendEmail} />
          <DashButton ghost label="Use a password instead" onPress={() => a.setMode('password')} />
        </>
      ) : (
        <>
          <L size={18}>{`Email sent to ${a.email.trim()}. Type the code from it below.`}</L>
          <DashField value={a.code} onChangeText={a.setCode} placeholder="123456" keyboardType="number-pad" maxLength={8} style={{ textAlign: 'center', fontSize: 28, letterSpacing: 6 }} />
          <DashButton label={a.busy ? 'Checking…' : 'Sign in'} disabled={a.busy || a.code.trim().length < 6} onPress={a.checkCode} />
          <DashButton ghost label="Use a different email" onPress={a.changeEmail} />
        </>
      )}
      {a.msg || a.linkError ? <L size={18} color={D.nudgeInk}>{a.msg ?? `That link didn't work: ${a.linkError}. Type the code from the email instead.`}</L> : null}
    </Group>
  );
}

/** The town for the weather. Same lookup as the phone: only the town name is sent. */
function TownPanel() {
  const D = useDash();
  const { state, updateSettings } = useStore();
  const place = state.settings.weatherPlace;
  const [town, setTown] = useState(place?.name ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const find = async () => {
    setBusy(true);
    setMsg(null);
    const r = await findTown(town);
    setBusy(false);
    if ('error' in r) return setMsg(r.error);
    updateSettings({ weatherPlace: r.place });
    setMsg(`Weather for ${r.place.name}.`);
  };
  return (
    <Group title="Weather town">
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <DashField value={town} onChangeText={setTown} placeholder="Your town" style={{ flex: 1 }} onSubmitEditing={find} />
        <DashButton label={busy ? 'Looking…' : 'Find'} disabled={busy || !town.trim()} onPress={find} />
      </View>
      <L size={16} color={D.muted}>{msg ?? (place ? `Showing weather for ${place.name}. Only the town is sent, never where you are.` : 'Type your town. Only the town is sent, never where you are.')}</L>
      {place ? <DashButton ghost label="Stop showing weather" onPress={() => { updateSettings({ weatherPlace: null }); setTown(''); setMsg(null); }} /> : null}
    </Group>
  );
}

export default function TabletSettings() {
  const D = useDash();
  const { state, updateSettings } = useStore();
  const s = state.settings;
  const look = s.look ?? 'match';
  const nextLook = () => {
    const i = LOOKS.findIndex((l) => l.id === look);
    updateSettings({ look: LOOKS[(i + 1) % LOOKS.length].id });
  };
  const lookValue = look === 'match' ? 'By time of day' : LOOKS.find((l) => l.id === look)!.label;
  const features = FEATURES.filter((f) => TABLET_FEATURES.includes(f.id));

  return (
    <DashShell active="settings">
      <View style={{ flex: 1, flexDirection: 'row', paddingTop: 32, paddingHorizontal: 32, gap: 24 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 24, paddingBottom: 24 }}>
          <L size={44} display>Settings</L>
          <Pressable
            onPress={() => Linking.sendIntent('android.settings.SETTINGS').catch(() => {})}
            accessibilityRole="button"
            style={{ height: 96, borderRadius: 24, backgroundColor: D.tile, borderWidth: 1, borderColor: D.line, justifyContent: 'center', paddingHorizontal: 24 }}
          >
            <L size={20}>Android settings</L>
          </Pressable>
          <View style={{ backgroundColor: D.tile, borderWidth: 1, borderColor: D.line, borderRadius: 24, padding: 24, gap: 16 }}>
            <L size={16} weight="strong" color={D.muted}>Your apps</L>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {APPS.map((a) => (
                <Pressable
                  key={a.label}
                  onPress={() => a.open().catch(() => {})}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${a.label}`}
                  style={{ flex: 1, height: 88, borderRadius: 18, backgroundColor: D.sunken, alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Icon name={a.icon} size={24} color={D.ink} />
                  <L size={16}>{a.label}</L>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={{ flex: 1, backgroundColor: D.tile, borderWidth: 1, borderColor: D.line, borderRadius: 24, padding: 24, marginBottom: 24 }}>
          <L size={28} display style={{ marginBottom: 8 }}>Focus settings</L>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Row label="Light and dark" value={lookValue} onPress={nextLook} />
            <Row label="Spaces shown here" value="Shared only" last />
            <DeviceRoleRow />
            <AccountPanel />
            <TownPanel />
            <Group title="Features">
              {features.map((f, i) => (
                <SwitchRow key={f.id} label={f.name} on={featureOn(s, f.id)} onChange={(v) => updateSettings(switchFeature(s, f.id, v))} last={i === features.length - 1} />
              ))}
            </Group>
          </ScrollView>
          <View style={{ backgroundColor: D.ink, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 20, marginTop: 16 }}>
            <L size={16} color={D.bg}>Money, sleep and Just for me stay on your phone</L>
          </View>
        </View>
      </View>
    </DashShell>
  );
}
