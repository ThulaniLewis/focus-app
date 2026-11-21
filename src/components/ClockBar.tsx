// The standing clock: real device time, the next fixed moment, time left today,
// and any running timer. Shown at the top of every screen.
import React from 'react';
import { Pressable, View } from 'react-native';
import { useNow, useStore } from '../lib/store';
import { radius, space, useColors } from '../theme';
import { dayKey, elapsedSec, fmtDuration, fmtElapsed, fmtTime, minutesBetween, minutesLeftToday, nextAnchor, roomNameOf } from '../lib/time';
import { openRoundStop, openStopFlow } from './Session';
import { T } from './ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ClockBar() {
  const now = useNow(1000);
  const { state } = useStore();
  const c = useColors();
  const anchor = nextAnchor(state, now);
  const left = minutesLeftToday(now, state.settings.dayEnd);
  const running = state.tasks.find((t) => t.timer?.startedAt && !t.done);
  const round = state.settings.round;
  const roundName = round ? roomNameOf(state.settings.rooms, round.room) ?? round.room : '';
  const inMin = anchor ? Math.round(minutesBetween(now, anchor.at)) : null;
  const urgent = anchor?.kind === 'leave' && inMin !== null && inMin <= 20;

  return (
    <View style={{ paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[2], gap: space[2], backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <T v="title" style={{ fontSize: 34, lineHeight: 40 }} accessibilityRole="header" accessibilityLabel={`Time ${fmtTime(now)}`}>
          {fmtTime(now)}
        </T>
        <View style={{ alignItems: 'flex-end', paddingBottom: 2 }}>
          <T v="bodyStrong">
            {DAYS[now.getDay()]} {now.getDate()} {MONTHS[now.getMonth()]}
          </T>
          <T v="caption" muted>
            {left > 0 ? `${fmtDuration(left)} until ${state.settings.dayEnd}` : 'Day done. Rest.'}
          </T>
        </View>
      </View>

      {anchor && inMin !== null && (
        <View
          style={{
            backgroundColor: urgent ? c.primary : c.primarySoft,
            borderRadius: radius.sm,
            paddingHorizontal: space[4],
            paddingVertical: space[2],
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <T v="bodyStrong" color={urgent ? c.onPrimary : c.primaryStrong} style={{ flex: 1 }} numberOfLines={1}>
            {anchor.label} {fmtTime(anchor.at)}
          </T>
          <T v="label" color={urgent ? c.onPrimary : c.primaryStrong}>
            {inMin <= 0 ? 'now' : `in ${fmtDuration(inMin)}`}
          </T>
        </View>
      )}

      {round && (
        <Pressable
          onPress={() => openRoundStop(dayKey(now))}
          accessibilityLabel={`In the ${roundName}${round.startedAt ? '' : ', paused'}. Tap to stop`}
          style={{
            backgroundColor: c.nudgeSoft,
            borderRadius: radius.sm,
            paddingHorizontal: space[4],
            paddingVertical: space[2],
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <T v="label" color={c.nudgeInk} numberOfLines={1} style={{ flex: 1 }}>
            In the {roundName.toLowerCase()}{round.startedAt ? '' : ' (paused)'} · tap to stop
          </T>
          <T v="label" color={c.nudgeInk}>{fmtElapsed(elapsedSec(round, now))}</T>
        </Pressable>
      )}

      {running && (
        <Pressable
          onPress={() => openStopFlow(running.id, dayKey(now))}
          accessibilityLabel={`Working on ${running.title}. Tap to stop`}
          style={{
            backgroundColor: c.nudgeSoft,
            borderRadius: radius.sm,
            paddingHorizontal: space[4],
            paddingVertical: space[2],
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <T v="label" color={c.nudgeInk} numberOfLines={1} style={{ flex: 1 }}>
            Working on: {running.title} · tap to stop
          </T>
          <T v="label" color={c.nudgeInk}>
            {fmtElapsed(elapsedSec(running.timer, now))}
            {running.estimateMin ? ` / ${running.estimateMin} min` : ''}
          </T>
        </Pressable>
      )}
    </View>
  );
}
