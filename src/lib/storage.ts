import { DIFFICULTIES, type Difficulty } from '@/lib/game/config';

const KEY_PREFIX = 'cheap-mosday:best:';

export type BestScores = Partial<Record<Difficulty, number>>;

const EMPTY: BestScores = {};

/**
 * localStorage 는 렌더 중에 읽을 수 없고(서버엔 없다) 차단된 환경에선 접근만 해도 던진다.
 * useSyncExternalStore 로 다루기 위한 작은 스토어로 감싸 둔다.
 */
let cache: BestScores | null = null;
const listeners = new Set<() => void>();

export function subscribeBest(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBestSnapshot(): BestScores {
  cache ??= readAll();
  return cache;
}

/** 서버 렌더에는 기록이 없다. 매번 같은 객체를 돌려줘야 무한 렌더를 피한다. */
export function getBestServerSnapshot(): BestScores {
  return EMPTY;
}

/** 더 높을 때만 저장한다. */
export function recordBest(difficulty: Difficulty, score: number) {
  const current = getBestSnapshot();
  if (score <= (current[difficulty] ?? 0)) return;

  try {
    localStorage.setItem(KEY_PREFIX + difficulty, String(score));
  } catch {
    // 저장 못 해도 판에는 영향이 없다. 이번 세션 동안은 캐시로 유지된다.
  }
  cache = { ...current, [difficulty]: score };
  for (const listener of listeners) listener();
}

function readAll(): BestScores {
  const scores: BestScores = {};
  for (const difficulty of DIFFICULTIES) {
    try {
      const value = Number(localStorage.getItem(KEY_PREFIX + difficulty));
      if (Number.isFinite(value) && value > 0) scores[difficulty] = value;
    } catch {
      // 읽을 수 없으면 기록 없음으로 둔다.
    }
  }
  return scores;
}
