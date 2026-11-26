/**
 * Small shared presentational pieces used across screens.
 */

/** Section heading with a rule, used to title panels. */
export function PanelTitle({ children, accent = false, className = '' }) {
  return (
    <div className={`mb-4 ${className}`}>
      <h2 className={`text-base font-semibold tracking-tight ${accent ? 'text-accent' : 'text-content'}`}>
        {children}
      </h2>
      <div
        className={`mt-2 h-px w-full ${
          accent
            ? 'bg-gradient-to-r from-accent/60 to-transparent'
            : 'bg-gradient-to-r from-line-strong to-transparent'
        }`}
      />
    </div>
  );
}

/** A labelled slider with a live value readout. */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => v,
  /** Optional secondary line under the slider, e.g. what the value means. */
  note,
  id,
  hint,
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="field-label mb-0">
          {label}
        </label>
        <span className="font-mono text-sm tnum text-accent">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        className="range mt-2"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {note ? (
        <p className="mt-1.5 text-[11px] leading-snug text-accent/80">{note}</p>
      ) : null}
      {hint ? <p className="mt-1 text-[11px] leading-snug text-content-subtle">{hint}</p> : null}
    </div>
  );
}

/** A segmented control — used for mode/duration pickers. */
export function SegmentedControl({ label, options, value, onChange, name }) {
  return (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div role="radiogroup" aria-label={label} className="segment w-fit">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              name={name}
              onClick={() => onChange(option.value)}
              className="segment-item"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Formats seconds as m:ss. */
export function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
