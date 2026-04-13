import { useTheme } from '../context/useTheme'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
      role="group"
      aria-label="화면 테마"
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        aria-pressed={theme === 'light'}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
          theme === 'light'
            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
      >
        라이트
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        aria-pressed={theme === 'dark'}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
          theme === 'dark'
            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
      >
        다크
      </button>
    </div>
  )
}
