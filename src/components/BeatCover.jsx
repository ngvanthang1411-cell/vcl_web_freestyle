/**
 * Vibrant 12-bar animated waveform cover tile.
 *
 * Uses each beat's sunset colour pair (`colors`) and bar heights (`bars`)
 * so every beat in the crate has a distinct, musical visual fingerprint.
 * When `playing` is true, the bars dance smoothly in time with the beat's BPM.
 */

const DEFAULT_BARS = [0.72, 0.28, 0.48, 0.94, 0.22, 0.56, 0.36, 0.2, 0.54, 1.0, 0.3, 0.42];
const DELAYS = [0, 0.2, 0.4, 0.1, 0.3, 0, 0.2, 0.4, 0.1, 0.3, 0, 0.2];

export default function BeatCover({ beat, playing = false, size = 'md' }) {
  const [c1, c2] = beat?.colors ?? ['#F78501', '#753F01'];
  const bars = beat?.bars ?? DEFAULT_BARS;
  const beatDur = beat?.bpm ? `${Math.max(0.32, Math.min(0.8, 60 / beat.bpm)).toFixed(2)}s` : '0.55s';

  const sizeClass = size === 'sm' ? 'h-10 w-10 rounded-[10px] p-1.5' : '';

  return (
    <div
      aria-hidden="true"
      className={`ygb-cover ${playing ? 'is-playing' : ''} ${sizeClass}`}
      style={{
        '--c1': c1,
        '--c2': c2,
        '--beat-dur': beatDur,
      }}
    >
      {bars.map((val, idx) => (
        <i
          key={idx}
          className="ygb-cover-bar"
          style={{
            '--v': val,
            '--d': DELAYS[idx % DELAYS.length],
          }}
        />
      ))}
    </div>
  );
}
