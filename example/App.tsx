import { useState } from 'react';
import { Alert, Button, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as SecureEnclave from 'expo-secure-enclave';

export default function App() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  async function checkAvailable() {
    setAvailable(await SecureEnclave.isAvailable());
  }

  async function enroll() {
    setBusy(true);
    try {
      setPublicKey(await SecureEnclave.getOrCreatePublicKey());
    } catch (error) {
      Alert.alert('Error', String(error));
    } finally {
      setBusy(false);
    }
  }

  async function signAndVerify() {
    setBusy(true);
    try {
      const message = `hello from expo-secure-enclave @ ${new Date().toISOString()}`;
      const signature = await SecureEnclave.sign(message);
      setLastSignature(signature);
      if (publicKey) {
        setVerified(SecureEnclave.verify(publicKey, message, signature));
      }
    } catch (error) {
      if (error instanceof SecureEnclave.SecureEnclaveError) {
        Alert.alert('SecureEnclaveError', error.reason);
      } else {
        Alert.alert('Error', String(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await SecureEnclave.deleteKey();
      setPublicKey(null);
      setLastSignature(null);
      setVerified(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>expo-secure-enclave</Text>

        <Group name="1. isAvailable()">
          <Button title="Check" onPress={checkAvailable} disabled={busy} />
          <Text style={styles.value}>{available === null ? '—' : String(available)}</Text>
        </Group>

        <Group name="2. getOrCreatePublicKey()">
          <Button title="Enrol" onPress={enroll} disabled={busy} />
          <Text style={styles.value} numberOfLines={2}>
            {publicKey ?? '—'}
          </Text>
        </Group>

        <Group name="3. sign() + verify()">
          <Button title="Sign a test message" onPress={signAndVerify} disabled={busy || !publicKey} />
          <Text style={styles.value} numberOfLines={2}>
            {lastSignature ?? '—'}
          </Text>
          <Text style={styles.value}>verified: {verified === null ? '—' : String(verified)}</Text>
        </Group>

        <Group name="4. deleteKey()">
          <Button title="Reset" color="#c0392b" onPress={reset} disabled={busy} />
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group(props: { name: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupHeader}>{props.name}</Text>
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 24, fontWeight: '600', margin: 20 },
  groupHeader: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  group: { margin: 20, marginTop: 0, backgroundColor: '#fff', borderRadius: 10, padding: 16 },
  container: { flex: 1, backgroundColor: '#eee' },
  content: { paddingBottom: 40 },
  value: { marginTop: 8, fontFamily: 'Courier', fontSize: 12, color: '#333' },
});
