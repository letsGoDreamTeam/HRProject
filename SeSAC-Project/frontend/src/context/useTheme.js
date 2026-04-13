import { useContext } from 'react'
import { ThemeContext } from './theme-context.js'

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme은 ThemeProvider 안에서만 사용하세요.')
  return ctx
}
