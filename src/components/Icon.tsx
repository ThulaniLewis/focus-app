import Feather from '@expo/vector-icons/Feather';
import React from 'react';

export type IconName = React.ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 22, color }: { name: string; size?: number; color: string }) {
  const valid = (Feather.glyphMap as Record<string, number>)[name] !== undefined;
  return <Feather name={(valid ? name : 'circle') as IconName} size={size} color={color} />;
}
