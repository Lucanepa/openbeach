import { useTranslation } from 'react-i18next'
import { BookOpenText, Moon, Sun } from 'lucide-react'
import { SegmentedControl } from '../../ui/volleyui/SegmentedControl.jsx'
import { OptionRow } from './optionRows_beach'
import { setTheme, useTheme } from '../../utils_beach/theme_beach'

/**
 * Options → Display: the colour theme (light, dark, e-ink). Applies at once
 * and to every OpenBeach page on this device. Kit markup: render it inside
 * `.ov-kit`.
 */
export default function ThemeOption() {
  const { t } = useTranslation()
  const theme = useTheme()
  const themes = [
    { value: 'light', label: t('options.themeLight'), icon: Sun },
    { value: 'dark', label: t('options.themeDark'), icon: Moon },
    { value: 'eink', label: t('options.themeEink'), icon: BookOpenText }
  ]
  return (
    <OptionRow
      stacked
      testId="options-theme"
      label={t('options.theme')}
      info={t('options.themeInfo')}
      below={(
        <SegmentedControl
          className="mt-2"
          ariaLabel={t('options.theme')}
          options={themes}
          value={theme}
          onChange={setTheme}
        />
      )}
    />
  )
}
