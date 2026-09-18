'use client';

import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from '@/lib/game/config';
import type { BestScores } from '@/lib/storage';

type TitleScreenProps = {
  best: BestScores;
  onStart: (difficulty: Difficulty) => void;
};

const SUMMARY: Record<Difficulty, string> = {
  easy: '느리게 · 라이프 5',
  normal: '보통 · 라이프 3',
  hard: '빠르게 · 라이프 2',
};

export function TitleScreen({ best, onStart }: TitleScreenProps) {
  return (
    <div className="bg-field absolute inset-0 flex flex-col items-center justify-center gap-10 px-6">
      <div className="text-center">
        <p className="font-mono text-base tracking-[0.35em] text-white/50">CHEAP MOSDAY</p>
        <p className="mt-3 text-xl text-white/70">난이도를 고르세요</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        {DIFFICULTIES.map((difficulty) => (
          <button
            key={difficulty}
            type="button"
            onClick={() => onStart(difficulty)}
            className="flex min-h-24 w-full flex-col justify-center gap-2 rounded-2xl border border-white/15 px-5 py-4 text-left transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none active:bg-white/15"
          >
            <span className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-3xl tracking-[0.15em]">
                {DIFFICULTY_LABEL[difficulty]}
              </span>
              <span className="text-sm tracking-[0.15em] text-white/50">
                {best[difficulty] ? (
                  <span className="font-mono">
                    BEST{' '}
                    <span className="text-xl text-white/85 tabular-nums">
                      {best[difficulty]?.toLocaleString()}
                    </span>
                  </span>
                ) : (
                  '기록 없음'
                )}
              </span>
            </span>
            {/* 설명은 기록과 같은 줄에 두면 좁은 화면에서 넘친다. */}
            <span className="block text-sm text-white/50">{SUMMARY[difficulty]}</span>
          </button>
        ))}
      </div>

      <p className="text-center text-base text-white/35">
        큐가 판정선에 닿는 순간 누르세요
        <span className="key-hint mt-2 block font-mono tracking-[0.2em] text-white/35">
          ← A F&nbsp; / &nbsp;→ D J
        </span>
      </p>
    </div>
  );
}
