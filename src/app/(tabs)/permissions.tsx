// Setup checklist: every permission Focus uses, with one plain line on why. Ticks itself off when you
// come back from Android's settings.
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Button, Card, Header, Screen, T } from '../../components/ui';
import { checkAll, PERMISSIONS, type PermissionId } from '../../lib/permissions';
import { space, useColors } from '../../theme';

export default function SetupChecklist() {
  const c = useColors();
  const [on, setOn] = useState<Partial<Record<PermissionId, boolean | null>>>({});
  const refresh = useCallback(() => {
    checkAll().then(setOn).catch(() => {});
  }, []);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  const done = PERMISSIONS.filter((p) => on[p.id] === true).length;

  return (
    <Screen>
      <Header title="Setup checklist" fallback="/settings" />
      <T v="body" muted>{`${done} of ${PERMISSIONS.length} on. Each one opens the right place; come back here and it ticks itself off.`}</T>
      <Card>
        {PERMISSIONS.map((p, i) => {
          const state = on[p.id];
          return (
            <View
              key={p.id}
              style={{ gap: space[2], paddingVertical: space[3], borderBottomWidth: i === PERMISSIONS.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <Icon name={state ? 'check-circle' : state === false ? 'circle' : 'help-circle'} size={22} color={state ? c.primary : c.inkMuted} />
                <T v="bodyStrong" style={{ flex: 1 }}>{p.name}</T>
              </View>
              <T v="body" muted>{p.why}</T>
              {state === false && (
                <>
                  {p.steps ? <T v="caption" muted>{p.steps}</T> : null}
                  <Button kind="soft" small label="Turn on" onPress={() => p.fix().finally(refresh)} />
                </>
              )}
              {state === null && <T v="caption" muted>This needs the next Focus update to check.</T>}
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
