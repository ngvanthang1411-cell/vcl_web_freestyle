import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WordCarousel from './WordCarousel';
import WordPop from './WordPop';
import { DEFAULT_WORD, WORD_BANK, sequentialWords } from '../data/words';
import { useLanguage } from '../i18n/LanguageContext';
import { useBeatClock } from '../hooks/useBeatClock';
import {
  TIMING,
  judgeOffset,
  offsetFromNearestBeat,
  snapToBeats,
} from '../lib/beatGrid';

/**
 * How many upcoming words are held behind the active one.
 *
 * Enough to read as a queue and plan a line over it, few enough that the
 * whole column fits inside the target frame without being clipped.
 */
const QUEUE_LENGTH = 3;

/**
 * The Bars Challenge word generator.
 *
 * Words appear on the beat. The reveal is driven by the beat clock rather
 * than a wall-clock timer, so the words stay locked to the music no matter
 * how long the session runs or how badly the browser stutters.
 *
 * A "hit" is registered when the performer presses the space bar or taps the
 * word while it is still on screen. How close that hit was to the beat
 * decides how it is judged — a hit on the beat explodes, a hit off the beat
 * only glows faintly.
 *
 * The component is controlled: the parent owns the clock so the timer can be
 * paused during the countdown and stopped cleanly at the end of a session.
 */
export default function WordGenerator({
  running,
  intervalMs,
  mode, // 'random' | 'sequential'
  burnMode,
  audio = null,
  bpm = 0,
  onWordShown,
  onWordHit,
  onWordMissed,
}) {
  const { locale, t } = useLanguage();
  const [word, setWord] = useState(DEFAULT_WORD);
  const [wordIndex, setWordIndex] = useState(0);
  const [burnLeft, setBurnLeft] = useState(null);
  const [pop, setPop] = useState(null); // { x, y, strength, key }
  const [flash, setFlash] = useState(null); // 'perfect' | 'good' | 'miss'
  // The words that are coming up, shown as a queue beneath the prompt.
  const [upcoming, setUpcoming] = useState([]);

  // The word currently on screen, and whether it has been hit.
  const pendingRef = useRef(null); // { id, text, hit }
  const indexRef = useRef(0);
  // A counter that gives every drawn word a stable id, so the carousel can
  // animate the same element as it moves between slots.
  const idRef = useRef(0);
  // The card in the target frame, so a hit can be shown bursting from the
  // word rather than from the corner of the screen.
  const frontCardRef = useRef(null);
  // The materialised queue of words not yet shown.
  const queueRef = useRef([]);

  // How many beats between words. Rounded to a whole number of beats so the
  // words always land on the grid.
  const intervalBeats = bpm ? Math.max(1, snapToBeats(intervalMs / 1000, bpm)) : 0;

  // The session's first beat, and how many beats have passed since. The
  // clock's own beat index restarts on every loop, so the count is kept
  // relative to this baseline instead.
  const baseBeatRef = useRef(null);
  const lastRevealRef = useRef(0);
  const nextDueRef = useRef(0);

  /** Reports the current word as missed, if it was not hit. */
  const flushMiss = useCallback(() => {
    const pending = pendingRef.current;
    if (pending && !pending.hit) {
      pendingRef.current = null;
      onWordMissed?.(pending.text);
      return true;
    }
    pendingRef.current = null;
    return false;
  }, [onWordMissed]);

  // Reset when the session restarts or the language changes. The queue is
  // refilled straight away, so the words are on screen before the first
  // beat drops and the player can read ahead.
  //
  // This effect lives after `fillQueue` is defined, further down — a
  // `useEffect` body runs after the whole component body, but the dependency
  // array is read during the render, so the binding must already exist.
  useEffect(() => {
    indexRef.current = 0;
    idRef.current = 0;
    pendingRef.current = null;
    queueRef.current = [];
    setWord(DEFAULT_WORD);
    setWordIndex(0);
    setBurnLeft(null);
    baseBeatRef.current = null;
    lastRevealRef.current = 0;
    nextDueRef.current = 0;
  }, [running, mode, locale]);

  /* ------------------------------------------------- the reveal interval */

  /**
   * Draws the next word from the bank.
   *
   * Sequential mode walks a de-duplicated bank in order; random mode picks
   * from the whole bank. The same function fills the preview queue and
   * reveals the active word, so what the queue shows is exactly what is
   * coming — the queue can never promise a word that does not arrive.
   *
   * Each word carries a stable id, so the carousel can animate the *same*
   * element as it moves up a slot rather than remounting it.
   */
  const drawWord = useCallback(() => {
    let text;
    if (mode === 'sequential') {
      const bank = sequentialWords(locale);
      text = bank[indexRef.current % bank.length];
      indexRef.current += 1;
    } else {
      const bank = WORD_BANK[locale] ?? WORD_BANK.en;
      text = bank[Math.floor(Math.random() * bank.length)];
    }
    return { id: `${idRef.current++}`, text };
  }, [mode, locale]);

  /** Keeps the preview queue topped up to QUEUE_LENGTH words. */
  const fillQueue = useCallback(() => {
    while (queueRef.current.length < QUEUE_LENGTH) {
      queueRef.current.push(drawWord());
    }
    setUpcoming([...queueRef.current]);
  }, [drawWord]);

  // Refill the queue whenever it runs dry or the word source changes, so
  // the words are on screen before the first beat drops.
  useEffect(() => {
    fillQueue();
  }, [fillQueue]);

  /**
   * Reveals the next word. Called when the beat clock crosses a boundary
   * that is a multiple of the interval, so the word always appears on the
   * beat rather than whenever a timer happens to fire.
   */
  const reveal = useCallback(() => {
    // The word we are replacing counts as a miss if it was never hit.
    flushMiss();

    // The active word is the head of the queue, so the queue and the
    // prompt can never disagree about what is coming next.
    const next = queueRef.current.shift() ?? drawWord();
    setUpcoming([...queueRef.current]);
    fillQueue();

    pendingRef.current = { id: next.id, text: next.text, hit: false };
    setWord(next.text);
    setWordIndex((i) => i + 1);
    // A fresh word starts with no verdict — the previous word's flash must not
    // carry over into it, and its explosion must not linger over the new word.
    setFlash(null);
    setPop(null);
    onWordShown?.(next.text);
  }, [drawWord, fillQueue, onWordShown, flushMiss]);

  /**
   * Called on every beat boundary by the beat clock.
   *
   * The first word appears immediately when the session starts, then every
   * `intervalBeats` beats after that.
   *
   * The beat index from the clock is *relative to the loop*, so it restarts
   * at zero every time the beat loops. Counting from a baseline taken when
   * the session starts — rather than from the clock's own index — keeps the
   * count running across loop boundaries. Otherwise the challenge would stop
   * revealing words after the first loop.
   */
  const handleBeat = useCallback(
    (beatIndex) => {
      if (!running) return;

      if (baseBeatRef.current === null) {
        // The session's first beat is the baseline.
        baseBeatRef.current = beatIndex;
        lastRevealRef.current = 0;
        nextDueRef.current = intervalBeats;
        reveal();
        return;
      }

      // How many beats have passed since the session started.
      const elapsedBeats = beatIndex - baseBeatRef.current;

      if (elapsedBeats >= nextDueRef.current) {
        lastRevealRef.current = elapsedBeats;
        nextDueRef.current = elapsedBeats + intervalBeats;
        reveal();
      }
    },
    [running, intervalBeats, reveal],
  );

  const beatClock = useBeatClock({
    audio,
    bpm,
    isPlaying: running && Boolean(audio),
    onBeat: handleBeat,
  });

  /**
   * Fallback for when there is no beat clock — a plain timer, so the
   * component still works if the audio element is unavailable.
   */
  useEffect(() => {
    if (!running || !audio || !intervalMs) return undefined;
    const id = setInterval(reveal, intervalMs);
    return () => clearInterval(id);
  }, [running, audio, intervalMs, reveal]);

  /* ------------------------------------------------------ burn mode timer */

  useEffect(() => {
    if (!running || !burnMode) {
      setBurnLeft(null);
      return undefined;
    }

    // The burn window is a little shorter than the interval, so a word always
    // disappears before the next one arrives.
    const burnMs = Math.max(1200, Math.min(intervalMs - 400, intervalMs * 0.75));
    setBurnLeft(burnMs);

    const id = setTimeout(() => {
      // The word vanished without a hit — this is a miss.
      flushMiss();
      setBurnLeft(null);
    }, burnMs);

    return () => clearTimeout(id);
  }, [running, burnMode, intervalMs, word, flushMiss]);

  /* ------------------------------------------------------------ the hit */

  const registerHit = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || pending.hit) return;
    pending.hit = true;

    // Work out how close to the beat this landed. The audio clock is the
    // reference, sampled at the moment of the hit — accurate to within a
    // frame, which is well inside the judgement window.
    let judgement = TIMING.MISS;
    let offsetMs = 0;

    if (bpm) {
      const live = beatClock.live.current;
      offsetMs = offsetFromNearestBeat(live.time, bpm);
      judgement = judgeOffset(offsetMs);
    }

    // Where the word is on screen, for the pop to originate from. The active
    // word is the front card of the carousel, so that is what is measured.
    let origin = { x: 0, y: 0 };
    if (frontCardRef.current) {
      const rect = frontCardRef.current.getBoundingClientRect();
      origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    if (judgement === TIMING.PERFECT || judgement === TIMING.GOOD) {
      setPop({
        ...origin,
        strength: judgement,
        // A changing key restarts the animation when two hits land together.
        key: `${Date.now()}-${pending.text}`,
      });
      setFlash(judgement);
    } else {
      setFlash('miss');
    }

    onWordHit?.(pending.text, {
      onBeat: judgement === TIMING.PERFECT,
      offsetMs,
      judgement,
    });
  }, [bpm, beatClock, onWordHit]);

  // SPACE hits the current word.
  useEffect(() => {
    if (!running) return undefined;
    const onKeyDown = (event) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      // Let buttons and inputs handle their own space presses.
      const tag = event.target?.tagName;
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return;
      }
      event.preventDefault();
      registerHit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [running, registerHit]);

  const burnProgress =
    burnLeft !== null && burnMode
      ? Math.max(0, Math.min(1, burnLeft / Math.max(1, intervalMs * 0.75)))
      : null;

  /**
   * The deck the carousel renders: the active word at the head, then the
   * words queued behind it.
   *
   * The active word is kept in the deck with the id it was drawn with, so
   * the carousel can animate it as it moves up rather than remounting it.
   */
  const activeRef = useRef({ id: 'active-0', text: DEFAULT_WORD });
  if (pendingRef.current) activeRef.current = pendingRef.current;
  else if (activeRef.current.text !== word) {
    activeRef.current = { id: `active-${wordIndex}`, text: word };
  }

  const deck = useMemo(
    () => [{ id: activeRef.current.id, text: activeRef.current.text }, ...upcoming],
    // The deck changes when the active word or the queue changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [word, wordIndex, upcoming],
  );

  return (
    <div className="stage-panel">
      {/* The target frame, with the deck of cards inside it. The frame clips
          its overflow, so a card leaving the top is cut off cleanly instead
          of spilling over the rest of the page. */}
      <div className="stage-well">
        <div className="stage-brackets" aria-hidden="true">
          <span className="stage-bracket stage-bracket-tl" />
          <span className="stage-bracket stage-bracket-tr" />
          <span className="stage-bracket stage-bracket-bl" />
          <span className="stage-bracket stage-bracket-br" />
        </div>

        <WordCarousel
          words={deck}
          running={running}
          bpm={bpm}
          onHit={registerHit}
          hitFlash={flash}
          frontRef={frontCardRef}
        />
      </div>

      {burnProgress !== null ? (
        <div aria-hidden="true" className="mx-auto mt-4 w-40">
          <div className="track h-[3px]">
            <div className="track-fill" style={{ width: `${burnProgress * 100}%` }} />
          </div>
        </div>
      ) : null}

      <p className="mt-5 text-center text-xs leading-relaxed text-content-subtle">
        {running ? t('words.pressHint') : t('words.idleHint')}
      </p>

      {/* The explosion, anchored to the word's position on screen. */}
      {pop ? (
        <WordPop origin={pop} strength={pop.strength} popKey={pop.key} />
      ) : null}
    </div>
  );
}
