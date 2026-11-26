import { useEffect, useRef, useState } from 'react';
import { getHypeTier } from '../lib/scoring';
import { useT } from '../i18n/LanguageContext';

/**
 * The Hype Meter.
 *
 * A plain arc gauge with the score in the middle and the tier underneath.
 * The score counts up from zero on mount so the reveal has some weight.
 */
export default function HypeMeter({ score, durationMs = 1400 }) {
  const t = useT();
  const [displayScore, setDisplayScore] = useState(0);
  const frameRef = useRef(null);
  const tier = getHypeTier(score);
  const tierLabel = t(`hype.tier.${tier.key}`);
  const tierBlurb = t(`hype.tier.${tier.key}.blurb`);

  // Count the number up.
  useEffect(() => {
    const start = performance.now();
    const delta = score;

    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplayScore(Math.round(delta * eased));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [score, durationMs]);

  // Arc geometry: a 240° sweep, opening downward.
  const R = 108;
  const STROKE = 14;
  const CX = 130;
  const CY = 124;
  const START_ANGLE = 150;
  const SWEEP = 240;

  const polar = (angleDeg, radius) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: CX + radius * Math.cos(rad),
      y: CY + radius * Math.sin(rad),
    };
  };

  const arcPath = (fromAngle, toAngle, radius) => {
    const start = polar(fromAngle, radius);
    const end = polar(toAngle, radius);
    const largeArc = toAngle - fromAngle > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  };

  const filledRatio = Math.max(0, Math.min(1, displayScore / 100));

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 260 200"
        className="w-full max-w-[300px]"
        role="img"
        aria-label={t('hype.aria', { score, tier: tierLabel })}
      >
        {/* Track */}
        <path
          d={arcPath(START_ANGLE, START_ANGLE + SWEEP, R)}
          fill="none"
          stroke="rgb(var(--color-line))"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />

        {/* Filled portion */}
        <path
          d={arcPath(START_ANGLE, START_ANGLE + SWEEP * filledRatio, R)}
          fill="none"
          stroke="rgb(var(--color-accent))"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />

        {/* Readout */}
        <text
          x={CX}
          y={CY - 8}
          textAnchor="middle"
          style={{
            fontSize: '58px',
            fontWeight: 600,
            fill: 'rgb(var(--color-content))',
            letterSpacing: '0.01em',
          }}
        >
          {displayScore}
        </text>
        <text
          x={CX}
          y={CY + 18}
          textAnchor="middle"
          style={{
            fontSize: '12px',
            fontWeight: 500,
            fill: 'rgb(var(--color-content-subtle))',
            letterSpacing: '0.18em',
          }}
        >
          {t('hype.outOf')}
        </text>
      </svg>

      <p className="mt-2 text-xl font-semibold tracking-tight text-accent">{tierLabel}</p>
      <p className="mt-1.5 max-w-xs text-center text-xs leading-relaxed text-content-muted">
        {tierBlurb}
      </p>
    </div>
  );
}
