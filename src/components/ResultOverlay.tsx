'use client';

import { formatTime } from '@/lib/format';
import { DIFFICULTY_LABEL, type Difficulty } from '@/lib/game/config';
import { useEffect } from 'react';

type ResultOverlayProps = {
  score: number;
  best: number;
  isNewBest: boolean;
  bestCombo: number;
  survivedMs: number;
  difficulty: Difficulty;
  onRestart: () => void;
  onChangeDifficulty: () => void;
};

export function ResultOverlay({
  score,
  best,
  isNewBest,
  bestCombo,
  survivedMs,
  difficulty,
  onRestart,
  onChangeDifficulty,
}: ResultOverlayProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault();
      onRestart();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onRestart]);

  return (
    <div className="bg-field/85 absolute inset-0 flex flex-col items-center justify-center gap-9 px-6 text-center font-mono backdrop-blur-sm">
      <p className="text-sm tracking-[0.3em] text-white/50">
        GAME OVER · <span className="font-sans">난이도</span>{' '}
        <span className="font-mono">{DIFFICULTY_LABEL[difficulty]}</span>
      </p>

      <div className="flex flex-col gap-2.5">
        <p className="text-6xl tabular-nums">{score.toLocaleString()}</p>
        {isNewBest ? (
          <p className="text-perfect text-lg tracking-[0.25em]">NEW BEST</p>
        ) : (
          <p className="text-base tracking-[0.15em] text-white/50 tabular-nums">
            BEST {best.toLocaleString()}
          </p>
        )}
        <p className="text-lg tracking-[0.15em] text-white/70 tabular-nums">
          SURVIVED {formatTime(survivedMs)}
        </p>
        <p className="text-base tracking-[0.15em] text-white/50">BEST COMBO {bestCombo}</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="min-h-13 rounded-full border border-white/25 px-10 text-base tracking-[0.2em] transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
        >
          RETRY
        </button>
        <button
          type="button"
          onClick={onChangeDifficulty}
          className="min-h-11 px-4 font-sans text-base text-white/50 transition-colors hover:text-white/85 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
        >
          난이도 변경
        </button>
      </div>

      {/* 키보드가 없는 기기에서는 쓸모없는 안내라 숨긴다. */}
      <p className="key-hint text-sm tracking-[0.2em] text-white/35">SPACE / ENTER</p>
    </div>
  );
}
