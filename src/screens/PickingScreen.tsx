import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBadge } from '../components/StatusBadge';
import { useFleet, useFleetTelemetry } from '../hooks/useFleetTelemetry';
import { WAYPOINTS, isWaypointName, type WaypointName } from '../types/waypoints';
import { colors, minTouchTarget } from '../theme/colors';

type Step = 'bin' | 'pallet' | 'agv' | 'dispatch' | 'done';

const STEPS: { id: Step; label: string }[] = [
  { id: 'bin', label: 'Bin' },
  { id: 'pallet', label: 'Pallet' },
  { id: 'agv', label: 'AGV' },
  { id: 'dispatch', label: 'Dispatch' },
];

const WAYPOINT_NAMES = Object.keys(WAYPOINTS) as WaypointName[];

export function PickingScreen() {
  const { t } = useTranslation();
  const fleet = useFleetTelemetry();
  const { dispatchTask } = useFleet();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('bin');
  const [bin, setBin] = useState<string | null>(null);
  const [pallet, setPallet] = useState<string | null>(null);
  const [agvId, setAgvId] = useState<string | null>(null);
  const [destination, setDestination] = useState<WaypointName | null>(null);
  const [manual, setManual] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lastScan = useRef<{ data: string; at: number } | null>(null);
  const scanning = step === 'bin' || step === 'pallet';

  function reset() {
    setStep('bin');
    setBin(null);
    setPallet(null);
    setAgvId(null);
    setDestination(null);
    setManual('');
    setNoticeKey(null);
  }

  function applyCode(raw: string) {
    const code = raw.trim();
    if (!code) {
      return;
    }
    if (step === 'bin') {
      setBin(code);
      if (isWaypointName(code)) {
        setDestination(code);
      }
      setStep('pallet');
      setManual('');
      return;
    }
    if (step === 'pallet') {
      setPallet(code);
      setStep('agv');
      setManual('');
    }
  }

  function onBarcodeScanned(data: string) {
    const now = Date.now();
    if (lastScan.current && lastScan.current.data === data && now - lastScan.current.at < 1500) {
      return;
    }
    lastScan.current = { data, at: now };
    applyCode(data);
  }

  async function dispatch() {
    if (!agvId || !destination || submitting) {
      return;
    }
    setSubmitting(true);
    setNoticeKey(null);
    const accepted = await dispatchTask(agvId, destination, pallet ?? undefined);
    setSubmitting(false);
    if (!accepted) {
      setNoticeKey('pick.rejected');
      return;
    }
    setStep('done');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.steps}>
        {STEPS.map((item, index) => {
          const currentIndex = STEPS.findIndex((entry) => entry.id === step);
          const reached = step === 'done' || index <= currentIndex;
          return (
            <View key={item.id} style={[styles.step, reached ? styles.stepReached : null]}>
              <Text style={[styles.stepText, reached ? styles.stepTextReached : null]}>
                {index + 1} {t(`pick.steps.${item.id}`)}
              </Text>
            </View>
          );
        })}
      </View>

      {scanning ? (
        <View style={styles.viewfinder}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'datamatrix'] }}
              onBarcodeScanned={({ data }) => onBarcodeScanned(data)}
              onMountError={(event) => setCameraError(event.message || t('pick.cameraUnavailable'))}
            />
          ) : (
            <View style={styles.permission}>
              <Text style={styles.permissionText}>
                {cameraError ?? (permission ? t('pick.cameraOff') : t('pick.cameraChecking'))}
              </Text>
              {permission && !permission.granted ? (
                <Pressable style={styles.secondary} onPress={() => void requestPermission()} accessibilityRole="button">
                  <Text style={styles.secondaryText}>{t('pick.enableCamera')}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          {permission?.granted ? <View pointerEvents="none" style={styles.reticle} /> : null}
        </View>
      ) : null}

      {scanning ? (
        <View style={styles.manualRow}>
          <TextInput
            value={manual}
            onChangeText={setManual}
            placeholder={step === 'bin' ? t('pick.binCode') : t('pick.palletId')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            style={styles.input}
            onSubmitEditing={() => applyCode(manual)}
          />
          <Pressable style={styles.apply} onPress={() => applyCode(manual)} accessibilityRole="button">
            <Text style={styles.applyText}>{t('pick.useCode')}</Text>
          </Pressable>
        </View>
      ) : null}

      <Summary label={t('pick.bin')} value={bin} />
      <Summary label={t('pick.pallet')} value={pallet} />

      {step === 'agv' ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t('pick.selectAgv')}</Text>
          {fleet.map((agv) => {
            const blocked = agv.status === 'FAULT' || agv.status === 'ESTOP';
            return (
              <Pressable
                key={agv.id}
                style={[styles.choice, blocked ? styles.choiceDisabled : null]}
                disabled={blocked}
                onPress={() => {
                  setAgvId(agv.id);
                  setStep('dispatch');
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: blocked }}
              >
                <Text style={styles.choiceTitle}>{agv.id}</Text>
                <StatusBadge status={agv.status} />
                <Text style={styles.choiceMeta}>{agv.batteryPercent.toFixed(0)}%</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {step === 'dispatch' ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t('pick.waypointFor', { id: agvId })}</Text>
          <View style={styles.chips}>
            {WAYPOINT_NAMES.map((name) => {
              const selected = name === destination;
              return (
                <Pressable
                  key={name}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                  onPress={() => setDestination(name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={[styles.primary, !destination || submitting ? styles.choiceDisabled : null]}
            disabled={!destination || submitting}
            onPress={() => void dispatch()}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{submitting ? t('pick.sending') : t('pick.dispatch')}</Text>
          </Pressable>
          {noticeKey ? <Text style={styles.notice}>{t(noticeKey)}</Text> : null}
        </View>
      ) : null}

      {step === 'done' ? (
        <View style={styles.block}>
          <Text style={styles.done}>
            {t('pick.done', { id: agvId, pallet, destination })}
          </Text>
          <Pressable style={styles.primary} onPress={reset} accessibilityRole="button">
            <Text style={styles.primaryText}>{t('pick.newTask')}</Text>
          </Pressable>
        </View>
      ) : null}

      {step !== 'bin' && step !== 'done' ? (
        <Pressable onPress={reset} accessibilityRole="button" style={styles.restart}>
          <Text style={styles.restartText}>{t('pick.restart')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Summary({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return null;
  }
  return (
    <Text style={styles.summary}>
      {label}: {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  steps: {
    flexDirection: 'row',
    gap: 6,
  },
  step: {
    flex: 1,
    minHeight: minTouchTarget,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepReached: {
    borderColor: colors.accent,
  },
  stepText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  stepTextReached: {
    color: colors.accent,
  },
  viewfinder: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reticle: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    top: '22%',
    bottom: '22%',
    borderWidth: 2,
    borderColor: colors.path,
    borderRadius: 8,
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  permissionText: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  manualRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: minTouchTarget,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  apply: {
    minHeight: minTouchTarget,
    minWidth: 104,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.path,
  },
  applyText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  summary: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  block: {
    gap: 8,
  },
  blockTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  choice: {
    minHeight: minTouchTarget,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  choiceDisabled: {
    opacity: 0.45,
  },
  choiceTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  choiceMeta: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: minTouchTarget,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.pickFill,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: colors.accent,
  },
  primary: {
    minHeight: minTouchTarget,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  primaryText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  secondary: {
    minHeight: minTouchTarget,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.path,
  },
  secondaryText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  notice: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: '600',
  },
  done: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  restart: {
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restartText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
});
