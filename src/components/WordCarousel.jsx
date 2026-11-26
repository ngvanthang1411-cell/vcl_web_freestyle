import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
// The core build plus the CSS plugin, imported by file path rather than
// through the package entry. The `gsap` entry point also pulls in
// ScrollTrigger, Observer and Flip, which this carousel does not use.
import { gsap } from 'gsap/gsap-core.js';
import { CSSPlugin } from 'gsap/CSSPlugin.js';
import { useT } from '../i18n/LanguageContext';

gsap.registerPlugin(CSSPlugin);

/**
 * The word carousel.
 *
 * The cards are a single deck of elements that move between slots. GSAP
 * animates each card from wherever it was to wherever it now belongs, so
 * the transition is a physical movement rather than a crossfade.
 *
 * The motion, on each new word:
 *
 *  1. The card at the head of the queue **slides up** into the target frame
 *     and **scales up** to its full size.
 *  2. The card that was in the frame **keeps going up**, shrinking and
 *     fading as it passes the top edge — it is clipped by the frame, so it
 *     never spills out over the rest of the page.
 *  3. The cards behind it each **slide up one slot**, and the new card at
 *     the tail **enters** from below.
 *
 * The timings are expressed in beats, not in milliseconds, so the whole
 * sequence lands on the music: a card takes one beat to travel up, which is
 * exactly the time until the next word is due.
 */
export default function WordCarousel({
  words, // [{ id, text }] — index 0 is the active word
  running,
  bpm,
  onHit, // (index) => void
  hitFlash, // 'perfect' | 'good' | 'miss' | null
  frontRef, // a ref to the card in the target frame
}) {
  const t = useT();
  const rootRef = useRef(null);
  const cardRefs = useRef(new Map()); // id -> element
  // The slot each card is currently animating towards.
  const slotRef = useRef(new Map());
  // GSAP timelines, so they can be killed on unmount or a beat change.
  const timelinesRef = useRef(new Set());

  /**
   * The length of one beat, in seconds. Every animation is scaled by it, so
   * the motion follows the tempo of whatever beat is loaded.
   */
  const beatSeconds = bpm > 0 ? 60 / bpm : 0.5;

  /** Registers a card element so it can be animated later. */
  const registerCard = useCallback((id) => (element) => {
    if (element) cardRefs.current.set(id, element);
    else cardRefs.current.delete(id);
  }, []);

  /**
   * Positions a card in its slot.
   *
   * The slots are laid out as a column: slot 0 is the target frame, and
   * each following slot is a little lower and a little smaller.
   */
  const slotTransform = useCallback(
    (slot) => ({
      y: slot * SLOT_GAP,
      scale: 1 - slot * SLOT_SHRINK,
      opacity: slot === 0 ? 1 : Math.max(0, 1 - slot * 0.17),
      zIndex: 100 - slot,
    }),
    [],
  );

  /**
   * Animates the deck to its new arrangement.
   *
   * Called whenever the word list changes. Each card is told where it
   * belongs; the ones that moved are tweened, and the ones that arrived are
   * dropped in from below.
   */
  const animateDeck = useCallback(
    (nextWords, { instant = false } = {}) => {
      const root = rootRef.current;
      if (!root) return;

      nextWords.forEach((entry, slot) => {
        const element = cardRefs.current.get(entry.id);
        if (!element) return;

        const previousSlot = slotRef.current.get(entry.id);
        const target = slotTransform(slot);

        // A card that was already in a slot just moves to its new one.
        if (previousSlot !== undefined && previousSlot !== slot) {
          const from = slotTransform(previousSlot);
          gsap.set(element, from);
        }

        // A card that has just arrived drops in from below its slot.
        if (previousSlot === undefined) {
          gsap.set(element, {
            ...target,
            y: target.y + SLOT_GAP,
            opacity: 0,
          });
        }

        if (instant) {
          gsap.set(element, target);
        } else {
          // The travel takes one beat, so the card arrives exactly when the
          // next word is due. That is what makes the motion feel locked to
          // the music rather than to a fixed duration.
          const tl = gsap.timeline();
          tl.to(element, {
            ...target,
            duration: beatSeconds * 0.92,
            ease: 'power3.out',
            overwrite: 'auto',
          });
          timelinesRef.current.add(tl);
          tl.eventCallback('onComplete', () => timelinesRef.current.delete(tl));
        }

        slotRef.current.set(entry.id, slot);
      });

      // Any card that is no longer in the deck is removed from the map.
      const live = new Set(nextWords.map((w) => w.id));
      for (const id of slotRef.current.keys()) {
        if (!live.has(id)) slotRef.current.delete(id);
      }
    },
    [beatSeconds, slotTransform],
  );

  // Lay the deck out on first mount, without animating.
  useLayoutEffect(() => {
    animateDeck(words, { instant: true });
    // Only on mount — later changes are driven by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate whenever the deck changes.
  useEffect(() => {
    animateDeck(words);
  }, [words, animateDeck]);

  // Kill every running timeline when the component unmounts, so no tween
  // keeps running against a detached node.
  useEffect(() => {
    const timelines = timelinesRef.current;
    return () => {
      timelines.forEach((tl) => tl.kill());
      timelines.clear();
      cardRefs.current.clear();
      slotRef.current.clear();
    };
  }, []);

  return (
    <div ref={rootRef} className="stage-deck">
      {words.map((entry, slot) => (
        <div
          key={entry.id}
          ref={(element) => {
            registerCard(entry.id)(element);
            // The front card is also exposed to the parent, so a hit can be
            // shown bursting from the word itself.
            if (slot === 0 && frontRef) frontRef.current = element;
          }}
          className={`stage-deck-card ${slot === 0 ? 'stage-deck-card-front' : ''}`}
          onClick={slot === 0 ? () => onHit?.() : undefined}
          onKeyDown={
            slot === 0
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onHit?.();
                  }
                }
              : undefined
          }
          role={slot === 0 ? 'button' : undefined}
          tabIndex={slot === 0 ? 0 : -1}
          aria-live={slot === 0 ? 'polite' : undefined}
          aria-label={slot === 0 ? t('words.aria', { word: entry.text }) : undefined}
        >
          <span className="stage-deck-text">{entry.text}</span>

          {/* The hit feedback — a brief confirmation on the card, so the
              player gets a response without the frame jumping. */}
          {slot === 0 && hitFlash && hitFlash !== 'miss' ? (
            <span className="stage-hit-badge" aria-hidden="true">
              <span className="stage-hit-mark">✓</span>
              {t(`words.hit.${hitFlash}`)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** How far apart two slots are, in pixels. */
const SLOT_GAP = 74;

/** How much smaller each slot is than the one above it. */
const SLOT_SHRINK = 0.07;
