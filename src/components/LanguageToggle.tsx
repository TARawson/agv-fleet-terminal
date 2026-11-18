import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, minTouchTarget } from '../theme/colors';

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const next = i18n.language.startsWith('ja') ? 'en' : 'ja';

  return (
    <Pressable
      style={styles.button}
      onPress={() => void i18n.changeLanguage(next)}
      accessibilityRole="button"
      accessibilityLabel={t('language.switchTo', { language: t(`language.${next}`) })}
    >
      <Text style={styles.text}>{t(`language.${next}`)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
});
