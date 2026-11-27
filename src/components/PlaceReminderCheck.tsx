// The check before a place reminder is kept: "When you arrive at X, remind you to …" Yes, change it or no.
// Nothing is saved until she says yes. Used after a dump.
import React, { useState } from 'react';
import { View } from 'react-native';
import { Field } from './Account';
import { Button, Card, T } from './ui';
import { confirmLine, type SuggestedReminder } from '../lib/placeTalk';
import { space } from '../theme';

export type ReminderAnswer = 'yes' | 'no' | null;

export function PlaceReminderCheck({
  r,
  placeName,
  answer,
  onAnswer,
  onChange,
}: {
  r: SuggestedReminder;
  placeName: string;
  answer: ReminderAnswer;
  onAnswer: (a: ReminderAnswer) => void;
  onChange: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Card tone={answer === 'yes' ? 'soft' : 'surface'} style={{ gap: space[2], opacity: answer === 'no' ? 0.5 : 1 }}>
      <T v="label" muted>A REMINDER FOR A PLACE</T>
      {editing ? (
        <Field value={r.text} onChangeText={onChange} autoFocus accessibilityLabel="What to remind you" multiline />
      ) : (
        <T v="heading">{confirmLine(r, placeName)}</T>
      )}
      {answer === 'yes' && !editing ? <T v="caption" muted>Kept. It goes off when you get there.</T> : null}
      {answer === 'no' ? <T v="caption" muted>Left out.</T> : null}
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <View style={{ flex: 1 }}>
          <Button
            small
            kind={answer === 'yes' ? 'primary' : 'soft'}
            label={editing ? 'Save' : 'Yes'}
            onPress={() => {
              setEditing(false);
              onAnswer('yes');
            }}
          />
        </View>
        {!editing && (
          <View style={{ flex: 1 }}>
            <Button small kind="soft" label="Change it" onPress={() => setEditing(true)} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Button
            small
            kind="quiet"
            label="No"
            onPress={() => {
              setEditing(false);
              onAnswer('no');
            }}
          />
        </View>
      </View>
    </Card>
  );
}
