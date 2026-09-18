import type { JudgeEvent } from '@/lib/game/types';

const HIT_SCORE = { perfect: 100, good: 50 } as const;

/** 아군을 지나보내는 건 정확도보다 참는 쪽이라 쳐냈을 때보다 적게 준다. */
const SPARE_SCORE = 50;

export type RunState = {
  score: number;
  combo: number;
  bestCombo: number;
  lives: number;
  /** 게임오버 시각 (게임 시작 기준 ms). 살아 있는 동안은 null. */
  endedAt: number | null;
};

export function createRun(lives: number): RunState {
  return { score: 0, combo: 0, bestCombo: 0, lives, endedAt: null };
}

/** 10콤보마다 배수가 0.5씩 오른다. */
export function comboMultiplier(combo: number) {
  return 1 + Math.floor(combo / 10) * 0.5;
}

export function applyJudge(run: RunState, event: JudgeEvent): RunState {
  // 게임오버 직후 엔진이 멈추기까지 한두 프레임이 남아 있을 수 있다.
  if (run.lives === 0) return run;

  switch (event.type) {
    case 'hit':
      return scored(run, HIT_SCORE[event.grade]);
    case 'spare':
      return scored(run, SPARE_SCORE);
    case 'miss': {
      const lives = run.lives - 1;
      return { ...run, combo: 0, lives, endedAt: lives === 0 ? event.at : run.endedAt };
    }
    case 'empty':
      return run.combo === 0 ? run : { ...run, combo: 0 };
  }
}

function scored(run: RunState, base: number): RunState {
  const combo = run.combo + 1;
  return {
    ...run,
    score: run.score + Math.round(base * comboMultiplier(combo)),
    combo,
    bestCombo: Math.max(run.bestCombo, combo),
  };
}
