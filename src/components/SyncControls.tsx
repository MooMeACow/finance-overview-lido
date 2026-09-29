import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, FieldLabel, Sheet, inputStyle, type IconName } from './ui';
import { radius, space, useColors } from '../theme';
import { forgetOnThisDevice, setupSync, syncNow, unlockSync, type SyncState } from '../sync';
import { ago, useSyncState } from '../sync/useSync';

/** Short status line, e.g. for the sidebar. */
export function syncLabel(s: SyncState): { icon: IconName; text: string; attention: boolean } {
  switch (s.status) {
    case 'synced':
      return { icon: 'cloud-done-outline', text: `Synced ${ago(s.lastSynced)}`, attention: false };
    case 'syncing':
      return { icon: 'sync-outline', text: 'Syncing…', attention: false };
    case 'checking':
      return { icon: 'sync-outline', text: 'Connecting…', attention: false };
    case 'setup':
      return { icon: 'cloud-upload-outline', text: 'Sync not set up yet', attention: true };
    case 'locked':
      return { icon: 'lock-closed-outline', text: 'Enter passphrase to sync', attention: true };
    case 'offline':
      return { icon: 'cloud-offline-outline', text: s.pending ? 'Offline · changes saved here' : 'Offline', attention: false };
    case 'signed_out':
      return { icon: 'log-in-outline', text: 'Login expired · reload the page', attention: true };
    case 'error':
      return { icon: 'alert-circle-outline', text: 'Sync problem', attention: true };
    default:
      return { icon: 'lock-closed-outline', text: 'Data stays on this device', attention: false };
  }
}

/** Banner at the top of the app when sync needs you. */
export function SyncBanner({ onOpen }: { onOpen: () => void }) {
  const c = useColors();
  const s = useSyncState();
  const [dismissed, setDismissed] = useState(false);
  const show = ['setup', 'locked', 'signed_out', 'error'].includes(s.status) && !(dismissed && s.status === 'setup');
  if (!show) return null;
  const text =
    s.status === 'setup'
      ? 'Set up sync to use your data on your other devices.'
      : s.status === 'locked'
        ? 'Enter your passphrase to sync this device.'
        : s.status === 'signed_out'
          ? 'Your login has expired. Reload the page to log in again.'
          : `Sync problem: ${s.message ?? 'unknown error'}`;
  return (
    <View style={[styles.banner, { backgroundColor: c.accentSoft, borderColor: c.cardBorder }]}>
      <Ionicons name={syncLabel(s).icon} size={18} color={c.primary} />
      <Text style={{ flex: 1, color: c.text, fontSize: 14 }}>{text}</Text>
      {s.status === 'signed_out' ? (
        <Pressable onPress={() => typeof window !== 'undefined' && window.location.reload()} style={styles.bannerAction}>
          <Text style={{ color: c.primary, fontWeight: '700' }}>Reload</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onOpen} style={styles.bannerAction}>
          <Text style={{ color: c.primary, fontWeight: '700' }}>{s.status === 'error' ? 'Details' : s.status === 'setup' ? 'Set up' : 'Unlock'}</Text>
        </Pressable>
      )}
      {s.status === 'setup' ? (
        <Pressable onPress={() => setDismissed(true)} accessibilityLabel="Not now" hitSlop={8}>
          <Ionicons name="close" size={18} color={c.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Set up, unlock and status of sync. */
export function SyncSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const s = useSyncState();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPass('');
      setPass2('');
      setError(null);
      setRemember(true);
    }
  }, [visible]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const setup = () => {
    if (pass.length < 10) return setError('Use at least 10 characters. A few random words work well.');
    if (pass !== pass2) return setError("The two passphrases don't match.");
    void run(() => setupSync(pass, remember));
  };
  const unlock = () => {
    if (!pass) return setError('Enter your passphrase.');
    void run(() => unlockSync(pass, remember));
  };

  const rememberRow = (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 15 }}>Remember on this device</Text>
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>Only on your own devices. Otherwise you'll enter it each visit.</Text>
      </View>
      <Switch value={remember} onValueChange={setRemember} />
    </View>
  );

  const passField = (label: string, value: string, onChange: (t: string) => void, onSubmit?: () => void) => (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={onSubmit}
        style={inputStyle(c)}
      />
    </View>
  );

  const errorLine = error ? (
    <View style={styles.errorRow}>
      <Ionicons name="alert-circle" size={16} color={c.danger} />
      <Text style={{ color: c.text, flex: 1 }}>{error}</Text>
    </View>
  ) : null;

  let body: React.ReactNode;
  if (s.status === 'setup') {
    body = (
      <>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          Your data is encrypted on this device with a passphrase before it's uploaded, so only you can read it. On your
          other devices you'll log in and enter the same passphrase.
        </Text>
        <View style={[styles.warning, { backgroundColor: c.background, borderColor: c.hairline }]}>
          <Ionicons name="key-outline" size={18} color={c.text} />
          <Text style={{ color: c.text, flex: 1, fontSize: 14, lineHeight: 20 }}>
            Write your passphrase down somewhere safe. If you forget it, the synced data can't be recovered by anyone.
          </Text>
        </View>
        {passField('Passphrase', pass, setPass)}
        {passField('Passphrase again', pass2, setPass2, setup)}
        {rememberRow}
        {errorLine}
        <Button label={busy ? 'Encrypting and uploading…' : 'Turn on sync'} icon="cloud-upload-outline" onPress={setup} disabled={busy} />
      </>
    );
  } else if (s.status === 'locked') {
    body = (
      <>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          Enter the passphrase you chose when you set up sync. Anything already on this device is kept and combined with
          your synced data.
        </Text>
        {s.message ? <Text style={{ color: c.text }}>{s.message}</Text> : null}
        {passField('Passphrase', pass, setPass, unlock)}
        {rememberRow}
        {errorLine}
        <Button label={busy ? 'Unlocking…' : 'Unlock and sync'} icon="lock-open-outline" onPress={unlock} disabled={busy} />
      </>
    );
  } else {
    const label = syncLabel(s);
    body = (
      <>
        <View style={[styles.statusCard, { backgroundColor: c.background, borderColor: c.hairline }]}>
          {s.status === 'syncing' || s.status === 'checking' ? <ActivityIndicator /> : <Ionicons name={label.icon} size={22} color={c.primary} />}
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{label.text}</Text>
            {s.email ? <Text style={{ color: c.textSecondary, fontSize: 13 }}>Logged in as {s.email}</Text> : null}
            {s.status === 'error' && s.message ? <Text style={{ color: c.text, fontSize: 13, marginTop: 4 }}>{s.message}</Text> : null}
          </View>
        </View>
        {s.status === 'unavailable' ? (
          <Text style={[styles.body, { color: c.textSecondary }]}>
            Sync works on the hosted version of the app. Here (for example on localhost) your data stays in this browser only.
          </Text>
        ) : (
          <>
            <Text style={[styles.body, { color: c.textSecondary }]}>
              Changes sync automatically. Your data is encrypted with your passphrase before it leaves this device.
            </Text>
            {errorLine}
            <Button label="Sync now" icon="sync-outline" onPress={() => void run(() => syncNow())} disabled={busy} />
            <Button
              label="Forget passphrase on this device"
              variant="secondary"
              icon="log-out-outline"
              onPress={() => void run(() => forgetOnThisDevice())}
              disabled={busy}
            />
          </>
        )}
      </>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={s.status === 'setup' ? 'Set up sync' : s.status === 'locked' ? 'Unlock sync' : 'Sync'}>
      {body}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bannerAction: { paddingVertical: 6, paddingHorizontal: 10 },
  body: { fontSize: 15, lineHeight: 21 },
  warning: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
});
