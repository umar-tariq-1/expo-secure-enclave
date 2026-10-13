import * as SecureEnclave from 'expo-secure-enclave';
import { useState } from 'react';
import { Button, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type LogEntry = { at: string; call: string; outcome: string; ok: boolean };

export default function App() {
  const [alias, setAlias] = useState('default');
  const [message, setMessage] = useState(() => `hello @ ${new Date().toISOString()}`);
  const [serverUrl, setServerUrl] = useState('http://192.168.1.10:8787');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  // Runs one call, and records exactly what came back: the value, or the SecureEnclaveError's
  // `reason` plus the platform's raw `message`. The device test plan (TEST_PLAN.md) reads this log.
  async function run<T>(call: string, fn: () => Promise<T>, show = (value: T) => String(value)) {
    setBusy(true);
    const at = new Date().toLocaleTimeString();
    try {
      const value = await fn();
      setLog((entries) => [{ at, call, outcome: show(value), ok: true }, ...entries]);
      return value;
    } catch (error) {
      const outcome =
        error instanceof SecureEnclave.SecureEnclaveError
          ? `SecureEnclaveError reason=${error.reason}\n${error.message}`
          : `NOT a SecureEnclaveError (bug, please report): ${String(error)}`;
      setLog((entries) => [{ at, call, outcome, ok: false }, ...entries]);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const short = (base64: string) => `${base64.slice(0, 24)}... (${base64.length} chars)`;

  async function getOrCreatePublicKey() {
    const key = await run('getOrCreatePublicKey', () => SecureEnclave.getOrCreatePublicKey(alias), short);
    if (key) setPublicKey(key);
  }

  async function sign() {
    const sig = await run('sign', () => SecureEnclave.sign(message, alias), short);
    if (sig) setSignature(sig);
  }

  async function deleteKey() {
    await run('deleteKey', () => SecureEnclave.deleteKey(alias), () => 'deleted (or never existed)');
    setPublicKey(null);
    setSignature(null);
  }

  async function verifyInApp() {
    if (!publicKey || !signature) return;
    await run('verify (in app)', async () => SecureEnclave.verify(publicKey, message, signature));
  }

  async function fetchChallenge() {
    const challenge = await run('GET /challenge', async () => {
      const response = await fetch(`${serverUrl}/challenge`);
      return ((await response.json()) as { challenge: string }).challenge;
    });
    if (challenge) setMessage(challenge);
  }

  async function verifyOnServer() {
    if (!publicKey || !signature) return;
    await run('POST /verify', async () => {
      const response = await fetch(`${serverUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey, message, signature }),
      });
      return JSON.stringify(await response.json());
    });
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Text style={styles.header}>expo-secure-enclave</Text>
      <Text style={styles.note}>{Platform.OS} · every result is logged at the bottom</Text>

      <Section title="Key alias">
        <TextInput style={styles.input} value={alias} onChangeText={setAlias} autoCapitalize="none" />
      </Section>

      <Section title="1. Check the device">
        <Row>
          <Button title="isAvailable" disabled={busy} onPress={() => run('isAvailable', SecureEnclave.isAvailable)} />
          <Button title="hasKey" disabled={busy} onPress={() => run('hasKey', () => SecureEnclave.hasKey(alias))} />
        </Row>
      </Section>

      <Section title="2. Create the key (no prompt)">
        <Button title="getOrCreatePublicKey" disabled={busy} onPress={getOrCreatePublicKey} />
        <Text style={styles.mono} selectable numberOfLines={3}>
          {publicKey ?? '-'}
        </Text>
      </Section>

      <Section title="3. Sign (prompts a biometric)">
        <TextInput style={styles.input} value={message} onChangeText={setMessage} multiline />
        <Button title="sign" disabled={busy} onPress={sign} />
        <Text style={styles.mono} selectable numberOfLines={3}>
          {signature ?? '-'}
        </Text>
      </Section>

      <Section title="4. Verify">
        <Button title="verify() in the app" disabled={busy || !signature} onPress={verifyInApp} />
        <Text style={styles.note}>
          Or verify on a server, the way a real backend would: run `npm run server` in example/, then
          use your computer's LAN address here.
        </Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          keyboardType="url"
        />
        <Row>
          <Button title="Get challenge" disabled={busy} onPress={fetchChallenge} />
          <Button title="Verify on server" disabled={busy || !signature} onPress={verifyOnServer} />
        </Row>
      </Section>

      <Section title="5. Delete the key">
        <Button title="deleteKey" color="#c0392b" disabled={busy} onPress={deleteKey} />
      </Section>

      <Section title="Log">
        <Button title="Clear" disabled={log.length === 0} onPress={() => setLog([])} />
        {log.map((entry, index) => (
          <Text key={log.length - index} style={[styles.mono, !entry.ok && styles.error]} selectable>
            {`${entry.at}  ${entry.call}\n${entry.outcome}`}
          </Text>
        ))}
      </Section>
    </ScrollView>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.children}
    </View>
  );
}

function Row(props: { children: React.ReactNode }) {
  return <View style={styles.row}>{props.children}</View>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 48, paddingBottom: 48, backgroundColor: '#eee' },
  header: { fontSize: 24, fontWeight: '600', marginHorizontal: 16 },
  note: { fontSize: 12, color: '#555', marginHorizontal: 16, marginVertical: 8 },
  section: { margin: 16, marginTop: 0, backgroundColor: '#fff', borderRadius: 10, padding: 16, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-around' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, fontSize: 14 },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, color: '#333' },
  error: { color: '#c0392b' },
});
