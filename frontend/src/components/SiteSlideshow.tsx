'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { type SiteSlide, slideSrc } from '@/lib/site-content';

/*
 * The rotating pictures and videos. Split in two on purpose: the "stage" is
 * the media itself and sits BEHIND the page's text, the "controls" sit in
 * front of it. Put together in one element the buttons would be buried under
 * the text and could not be clicked.
 *
 * What it takes care of so the page does not have to:
 *  - a picture is shown for the chosen number of seconds; a video plays to its
 *    end first (with a safety net), muted, as browsers require for autoplay;
 *  - a file that fails to load is dropped, not shown as a blank slide;
 *  - people who ask their device to reduce motion get no automatic rotation,
 *    no zoom and no video;
 *  - nothing advances while the tab is hidden or while the person has paused it.
 */

export interface SlideshowState {
  playable: SiteSlide[];
  index: number;
  setIndex: (i: number) => void;
  next: () => void;
  prev: () => void;
  paused: boolean;
  setPaused: (p: boolean) => void;
  reduced: boolean;
  intervalSeconds: number;
  markBlocked: (id: string) => void;
  markBroken: (id: string) => void;
  setDuration: (id: string, seconds: number) => void;
}

export function useSlideshow(slides: SiteSlide[], intervalSeconds: number, imagesOnly = false): SlideshowState {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [blocked, setBlocked] = useState<Set<string>>(() => new Set());
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const [durations, setDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const playable = useMemo(
    () => slides.filter((s) => s.enabled && !!slideSrc(s) && !broken.has(s.id) && !(s.type === 'VIDEO' && (imagesOnly || reduced))),
    [slides, imagesOnly, reduced, broken],
  );
  const count = playable.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const current = playable[safeIndex];

  const next = useCallback(() => setIndex((i) => (count === 0 ? 0 : (Math.min(i, count - 1) + 1) % count)), [count]);
  const prev = useCallback(() => setIndex((i) => (count === 0 ? 0 : (Math.min(i, count - 1) - 1 + count) % count)), [count]);
  const markBlocked = useCallback((id: string) => setBlocked((s) => new Set(s).add(id)), []);
  const markBroken = useCallback((id: string) => setBroken((s) => new Set(s).add(id)), []);
  const setDuration = useCallback((id: string, seconds: number) => setDurations((m) => ({ ...m, [id]: seconds })), []);

  useEffect(() => {
    if (count < 2 || paused || hidden || reduced || !current) return;
    let ms = intervalSeconds * 1000;
    if (current.type === 'VIDEO' && !blocked.has(current.id)) {
      // A video moving on by itself (its "ended" event) is the normal path; this timer is only the safety net.
      const d = durations[current.id];
      ms = (Number.isFinite(d) && d > 0 ? Math.min(Math.max(d, intervalSeconds), 45) : 45) * 1000 + 1500;
    }
    const t = setTimeout(next, ms);
    return () => clearTimeout(t);
  }, [safeIndex, count, paused, hidden, reduced, current, intervalSeconds, blocked, durations, next]);

  return { playable, index: safeIndex, setIndex, next, prev, paused: paused || hidden, setPaused, reduced, intervalSeconds, markBlocked, markBroken, setDuration };
}

function SlideLayer({ slide, active, near, show, single }: { slide: SiteSlide; active: boolean; near: boolean; show: SlideshowState; single: boolean }) {
  const src = slideSrc(slide) as string;
  const { paused, reduced, intervalSeconds, markBlocked, markBroken, setDuration, next } = show;
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!video) return;
    if (active && !paused) {
      const played = video.play();
      if (played) played.catch(() => markBlocked(slide.id));
    } else {
      video.pause();
      if (!active) video.currentTime = 0;
    }
  }, [video, active, paused, markBlocked, slide.id]);

  if (slide.type === 'VIDEO') {
    if (!near) return null;
    return (
      <video
        ref={setVideo}
        src={src}
        muted
        playsInline
        loop={single}
        preload={active ? 'auto' : 'metadata'}
        aria-label={slide.alt || undefined}
        onEnded={single ? undefined : next}
        onLoadedMetadata={(e) => setDuration(slide.id, e.currentTarget.duration)}
        onError={() => markBroken(slide.id)}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={slide.alt}
      loading={near ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => markBroken(slide.id)}
      className={`h-full w-full object-cover ${active && !reduced ? 'kam-kenburns' : ''}`}
      style={active && !reduced ? { animationDuration: `${intervalSeconds + 3}s` } : undefined}
    />
  );
}

/** The media layers, cross-fading. Give it `absolute inset-0` (or another positioned box). Renders nothing when there is nothing to show. */
export function SlideshowStage({ show, className = '', label = 'Pictures and videos', children }: { show: SlideshowState; className?: string; label?: string; children?: ReactNode }) {
  const { playable, index } = show;
  if (playable.length === 0) return null;
  const nextIndex = (index + 1) % playable.length;
  return (
    <div
      className={`overflow-hidden ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      data-testid="site-slideshow"
      data-active-index={index}
      data-count={playable.length}
    >
      {playable.map((s, i) => (
        <div
          key={s.id}
          data-slide-id={s.id}
          data-active={i === index ? 'true' : 'false'}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-[1400ms] ease-in-out ${i === index ? 'opacity-100' : 'opacity-0'}`}
        >
          <SlideLayer slide={s} active={i === index} near={i === index || i === nextIndex} show={show} single={playable.length === 1} />
        </div>
      ))}
      {children}
    </div>
  );
}

/** Previous, next, one dot per slide, and a pause button. Hidden when there is only one slide. */
export function SlideshowControls({ show, className = '' }: { show: SlideshowState; className?: string }) {
  const { playable, index, setIndex, next, prev, paused, setPaused } = show;
  if (playable.length < 2) return null;
  const button = 'grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-husk-300';
  return (
    <div className={`flex items-center gap-3 ${className}`} role="group" aria-label="Slideshow controls">
      <button type="button" onClick={prev} aria-label="Previous slide" className={button}><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
      <div className="flex items-center gap-1.5">
        {playable.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show slide ${i + 1} of ${playable.length}`}
            aria-current={i === index ? 'true' : undefined}
            className={`h-2.5 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-husk-300 ${i === index ? 'w-7 bg-husk-300' : 'w-2.5 bg-white/55 hover:bg-white/85'}`}
          />
        ))}
      </div>
      <button type="button" onClick={next} aria-label="Next slide" className={button}><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
      <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? 'Play slideshow' : 'Pause slideshow'} className={button}>
        {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

/** The current slide's caption, if it has one. */
export function SlideshowCaption({ show, className = '' }: { show: SlideshowState; className?: string }) {
  const caption = show.playable[show.index]?.caption;
  return caption ? <p className={className} data-testid="slide-caption">{caption}</p> : null;
}
