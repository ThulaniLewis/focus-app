// The tablet's Settings panel, built to "Tablet settings panel"
// (docs/design/improvements/project/TabletSettings.dc.html). Shared screen: nothing private here.
import { router } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { DashShell, L, useDash } from '../../components/TabletDash';
import { FEATURES, featureOn, switchFeature, type FeatureId } from '../../lib/features';
import { LOOKS } from '../../lib/look';
import { useStore } from '../../lib/store';

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
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Pressable
              onPress={() => Linking.sendIntent('android.settings.SETTINGS').catch(() => {})}
              accessibilityRole="button"
              style={{ flex: 1, height: 96, borderRadius: 24, backgroundColor: D.tile, borderWidth: 1, borderColor: D.line, justifyContent: 'center', paddingHorizontal: 24 }}
            >
              <L size={20}>Android settings</L>
            </Pressable>
            <Pressable
              onPress={() => router.navigate('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Focus settings, all of them"
              style={{ flex: 1, height: 96, borderRadius: 24, backgroundColor: D.primarySoft, borderWidth: 1, borderColor: D.primarySoft, justifyContent: 'center', paddingHorizontal: 24 }}
            >
              <L size={20} color={D.primaryStrong}>Focus settings</L>
            </Pressable>
          </View>
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
          <ScrollView>
            <Row label="Light and dark" value={lookValue} onPress={nextLook} />
            <Row label="Spaces shown here" value="Shared only" />
            <Row label="Weather" value={s.weatherPlace ? s.weatherPlace.name : 'Set your town on your phone'} />
            {features.map((f, i) => (
              <SwitchRow key={f.id} label={f.name} on={featureOn(s, f.id)} onChange={(v) => updateSettings(switchFeature(s, f.id, v))} last={i === features.length - 1} />
            ))}
          </ScrollView>
          <View style={{ backgroundColor: D.ink, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 20, marginTop: 16 }}>
            <L size={16} color={D.bg}>Money, sleep and Just for me stay on your phone</L>
          </View>
        </View>
      </View>
    </DashShell>
  );
}
