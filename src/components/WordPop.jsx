import { useEffect, useState } from 'react';

/**
 * The on-beat burst.
 *
 * When the performer lands a word exactly on the beat, a ring of sparks
 * fires from the word's position. It is rendered into a fixed overlay so it
 * can escape the word's own overflow clipping.
 *
 * `strength` scales the effect: a perfect hit gets the full burst, a
 * near-miss gets a smaller, dimmer one.
 */

/** How many rays fire out of the centre. */
const RAY_COUNT = 10;

/** How long the overlay lives before it removes itself, in ms. */
const LIFETIME = 620;

export default function WordPop({ origin, strength = 'perfect', popKey }) {
  const [visible, setVisible] = useState(true);

  // Remove the overlay once the animation has played out. The parent re-keys
  // this component for each hit, so the animation restarts every time.
  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), LIFETIME);
    return () => clearTimeout(timer);
  }, [popKey]);

  if (!origin || !visible) return null;

  const perfect = strength === 'perfect';
  const size = perfect ? 210 : 130;

  return (
    <div
      key={popKey}
      aria-hidden="true"
      className="pointer-events-none fixed z-30"
      style={{
        left: origin.x,
        top: origin.y,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
      }}
    >
      {/* The expanding ring */}
      <div
        className="animate-pop-ring absolute inset-0 rounded-full border-2 border-accent"
        style={{ opacity: perfect ? 0.9 : 0.45 }}
      />

      {/* Secondary echo ring on a perfect hit */}
      {perfect ? (
        <div
          className="animate-pop-ring absolute inset-3 rounded-full border border-secondary/70"
          style={{ animationDelay: '70ms' }}
        />
      ) : null}

      {/* The rays — the accent colour, the colour of the word they came from. */}
      {Array.from({ length: RAY_COUNT }, (_, i) => {
        const angle = (360 / RAY_COUNT) * i;
        const length = perfect ? 28 : 16;
        return (
          // The outer element carries the rotation, the inner one the travel
          // animation. A running animation replaces `transform` wholesale,
          // so rotation and translation cannot share one element.
          <span
            key={i}
            className="absolute left-1/2 top-1/2 block"
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: '50% 0',
            }}
          >
            <span
              className={`animate-pop-ray block rounded-full ${
                perfect && i % 2 === 1 ? 'bg-secondary' : 'bg-accent'
              }`}
              style={{
                width: perfect ? 4 : 3,
                height: length,
                marginLeft: perfect ? -2 : -1.5,
                marginTop: -length - 12,
                opacity: perfect ? 0.95 : 0.5,
              }}
            />
          </span>
        );
      })}
    </div>
  );
}
