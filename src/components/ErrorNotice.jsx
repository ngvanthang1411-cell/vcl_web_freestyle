import { useT } from '../i18n/LanguageContext';

/**
 * A styled notice for permission problems and unsupported browsers.
 * Always offers a way forward so the screen is never a dead end.
 */
export default function ErrorNotice({ title, detail, hint, actions, tone = 'error' }) {
  const t = useT();
  const warn = tone === 'warn';

  return (
    <div
      role="alert"
      className={`panel p-5 ${warn ? 'border-warning/45' : 'border-danger/45'} ${
        warn ? 'bg-warning/[0.06]' : 'bg-danger/[0.06]'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-2 h-2 w-2 shrink-0 rounded-full ${warn ? 'bg-warning' : 'bg-danger'}`}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight text-content">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-content-muted">{detail}</p>
        </div>
      </div>

      {hint ? (
        <div className="mt-4 ml-5 border-l border-line pl-4">
          <p className="field-label mb-1.5">{t('errors.howToFix')}</p>
          <ul className="space-y-1 text-xs leading-relaxed text-content-muted">
            {hint.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {actions?.length ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={`btn ${action.variant === 'secondary' ? 'btn-secondary' : 'btn-primary'}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
