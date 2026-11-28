// "Leaving for nursery moved to 08:00 (28 min with traffic)" with Undo, on Today (brief 1b Fix 3).
// Phone only: trips and leave-by times stay with her places.
import React from 'react';
import { View } from 'react-native';
import { Button, Card, T } from './ui';
import { useDeviceRole } from '../lib/device';
import { undoLive, useGeo } from '../lib/geoStore';
import { useNow } from '../lib/store';
import { dayKey, fmtTime } from '../lib/time';
import { space } from '../theme';

export function LiveTripCards() {
  const role = useDeviceRole();
  const geo = useGeo();
  const now = useNow(60000);
  if (role !== 'phone') return null;
  const today = dayKey(now);
  const recs = (geo.live ?? []).filter((r) => r.day === today && !r.undone && r.leaveAt !== r.usualLeaveAt && new Date(r.arriveAt).getTime() > now.getTime());
  if (!recs.length) return null;
  return (
    <>
      {recs.map((r) => (
        <Card key={r.key} tone="nudge" style={{ gap: space[1] }}>
          <T v="label">LIVE TRAFFIC</T>
          <T v="bodyStrong">{`Leave for ${r.placeName} at ${fmtTime(new Date(r.leaveAt))}`}</T>
          <T v="caption">{`${r.liveMin ?? '?'} min right now${r.staticMin ? `, usually ${r.staticMin}` : ''}. You'd normally leave at ${fmtTime(new Date(r.usualLeaveAt))}.`}</T>
          {r.moved.map((m) => (
            <T key={m.taskId} v="caption">{`${m.title}: moved to ${fmtTime(new Date(m.to))}`}</T>
          ))}
          <View style={{ alignSelf: 'flex-start' }}>
            <Button small kind="soft" label="Undo" onPress={() => undoLive(r.key).catch(() => {})} />
          </View>
        </Card>
      ))}
    </>
  );
}
