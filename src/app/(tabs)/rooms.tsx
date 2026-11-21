// Older builds had a Rooms tab. Rooms now live in the Home space; this keeps old links working.
import { Redirect } from 'expo-router';
import React from 'react';

export default function OldRooms() {
  return <Redirect href="/space/home" />;
}
