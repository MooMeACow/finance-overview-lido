import type { Layout, Mood, OtterSpec } from './otter/engine';

export type { Mood, OtterSpec };
export type RaftLayout = Omit<Layout, 'width' | 'height'>;

/** Phone app: the otters live on the web version for now. */
export function OtterRaft(_props: {
  otters: OtterSpec[];
  mood: Mood;
  layout: RaftLayout;
  intro: boolean;
  onPress?: (id: number) => void;
}) {
  return null;
}
