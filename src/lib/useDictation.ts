// The mic for "Talk it through" and "Note for Claude": listening, the live words, the cancel (X)
// and the tick. The tick stops the mic, waits for the last words to land, then calls onDone with the
// whole text, so the screen can send it straight away.
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { claimMic, micOwner, releaseMic } from './mic';

export const BARS = 24;

const join = (a: string, b: string) => (a.trim() ? `${a.trim()} ${b.trim()}` : b.trim());

export function useDictation(owner: string, onDone: (finalText: string) => void, onStart?: () => void) {
  const [text, setTextState] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef('');
  const before = useRef('');
  const pending = useRef(''); // words heard but not yet confirmed final when the tick was tapped
  const interimRef = useRef('');
  const ignoring = useRef(false); // after cancel, drop anything still on its way
  const wantDone = useRef(false); // the tick was tapped: hand the text over once the mic has ended
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  const setText = (t: string) => {
    textRef.current = t;
    setTextState(t);
  };
  const setHeard = (t: string) => {
    interimRef.current = t;
    setInterim(t);
  };

  useSpeechRecognitionEvent('start', () => micOwner() === owner && setListening(true));
  /** The mic has ended (or the tick's safety timer ran out): flush the last words, then hand over. */
  const settle = () => {
    releaseMic(owner);
    if (pending.current && !ignoring.current) setText(join(textRef.current, pending.current));
    pending.current = '';
    setListening(false);
    setHeard('');
    setLevels(Array(BARS).fill(0));
    if (wantDone.current) {
      wantDone.current = false;
      if (ignoring.current) return;
      const final = textRef.current.trim();
      if (!final) setError("I didn't catch anything. Tap the mic and try again, or type instead.");
      else doneRef.current(final);
    }
  };
  useSpeechRecognitionEvent('end', () => {
    if (micOwner() !== owner) return;
    settle();
  });
  useSpeechRecognitionEvent('result', (e) => {
    if (micOwner() !== owner || ignoring.current) return;
    const said = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      pending.current = '';
      setText(join(textRef.current, said));
      setHeard('');
    } else setHeard(said);
  });
  useSpeechRecognitionEvent('volumechange', (e) => {
    if (micOwner() !== owner) return;
    const v = Math.max(0, Math.min(1, (e.value + 2) / 12));
    setLevels((l) => [...l.slice(1), v]);
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (micOwner() !== owner) return;
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    setError(e.error === 'not-allowed' ? 'Focus needs the microphone. Allow it in your phone settings, or type instead.' : `The mic stopped (${e.message || e.error}). Your words so far are kept.`);
  });

  const start = async () => {
    setError(null);
    onStart?.();
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return setError('Focus needs the microphone. Allow it in your phone settings, or type instead.');
      before.current = textRef.current;
      claimMic(owner);
      ignoring.current = false;
      wantDone.current = false;
      pending.current = '';
      ExpoSpeechRecognitionModule.start({
        lang: 'en-GB',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 90 },
      });
    } catch {
      setError("The mic isn't available here. Type instead, or use the mic on your keyboard.");
    }
  };
  /** The tick: stop listening, keep the words, then send. */
  const keep = () => {
    pending.current = interimRef.current;
    wantDone.current = true;
    ExpoSpeechRecognitionModule.stop();
    // If the mic never says it has ended, don't leave the tick doing nothing.
    setTimeout(() => {
      if (wantDone.current) settle();
    }, 3000);
  };
  /** The X: throw away what was just said. */
  const cancel = () => {
    ignoring.current = true;
    wantDone.current = false;
    pending.current = '';
    ExpoSpeechRecognitionModule.abort();
    setText(before.current);
    setHeard('');
  };

  return { text, setText, interim, listening, levels, error, setError, start, keep, cancel, shown: interim ? join(text, interim) : text };
}
