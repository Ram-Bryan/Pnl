import React, { useState, useEffect } from 'react';
import { View, Alert } from 'react-native';
import { Sheet, Field, TextInputField, Button } from './index';

export function StrategyFormSheet({
  visible,
  onClose,
  initial,
  onSubmit,
  saving = false,
}: {
  visible: boolean;
  onClose: () => void;
  initial?: { name: string; description: string | null };
  onSubmit: (input: { name: string; description: string | null }) => Promise<void> | void;
  saving?: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
    }
  }, [visible, initial]);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Strategy name is required.');
      return;
    }
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || null });
      onClose();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save strategy.');
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={initial ? 'Edit Strategy' : 'New Strategy'}>
      <View className="mt-4">
        <Field label="Name *">
          <TextInputField value={name} onChangeText={setName} placeholder="e.g. ICT Killzone" />
        </Field>
        <Field label="Description">
          <TextInputField
            value={description}
            onChangeText={setDescription}
            placeholder="What is the edge? When does it work?"
            multiline
            style={{ minHeight: 80 }}
          />
        </Field>
        <View className="pt-2 pb-4">
          <Button title={saving ? 'Saving…' : 'Save Strategy'} onPress={submit} disabled={saving} />
        </View>
      </View>
    </Sheet>
  );
}
