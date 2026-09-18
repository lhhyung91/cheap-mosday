import type { Lane } from '@/lib/game/types';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '하',
  normal: '중',
  hard: '상',
};

export type Stage = {
  /** 이 단계가 적용되기 시작하는 경과 시간 (ms). */
  from: number;
  intervalMs: number;
  /** decoy + mirror 확률의 합이 1을 넘지 않아야 한다. 나머지는 dodge. */
  decoyChance: number;
  mirrorChance: number;
  /** 좌우 동시 큐가 나올 확률. */
  doubleChance: number;
};

/** 난이도에 따라 달라지는 값만 모아 둔다. 색·키 매핑처럼 고정된 건 아래 상수로 남긴다. */
export type Ruleset = {
  /** DODGE 판정 윈도우 (ms). 판정선 통과 시각 기준 ±값. */
  perfectWindow: number;
  goodWindow: number;
  /** MIRROR는 "언제 칠지 고르는" 큐라 이른 쪽 수락 구간이 넓다. */
  mirrorEarlyWindow: number;
  /** 적이 치는 시각과 이만큼 안쪽이면 부딪혀서 실패. */
  mirrorClashWindow: number;
  /** 부딪히기 직전까지 붙여서 치면 PERFECT. */
  mirrorTightWindow: number;
  /** 적이 치는 시각의 범위 (판정선 시각 기준 ms). */
  mirrorEnemyOffset: { min: number; max: number };
  /** 큐가 스폰 지점에서 판정선까지 이동하는 시간 (ms). 짧을수록 반응 난이도가 올라간다. */
  approachMs: number;
  lives: number;
  stages: Stage[];
};

/**
 * 난이도 곡선. 규칙이 단순한 DECOY를 먼저 가르치고 MIRROR를 나중에 얹는다.
 * 30~40초 생존을 목표로 잡은 값이라 플레이해보고 조정한다.
 */
const NORMAL_STAGES: Stage[] = [
  { from: 0, intervalMs: 1200, decoyChance: 0, mirrorChance: 0, doubleChance: 0 },
  { from: 10_000, intervalMs: 1150, decoyChance: 0.2, mirrorChance: 0, doubleChance: 0 },
  { from: 20_000, intervalMs: 1050, decoyChance: 0.2, mirrorChance: 0.25, doubleChance: 0 },
  { from: 35_000, intervalMs: 900, decoyChance: 0.25, mirrorChance: 0.3, doubleChance: 0.1 },
  { from: 60_000, intervalMs: 700, decoyChance: 0.25, mirrorChance: 0.3, doubleChance: 0.2 },
];

/** 기준 곡선을 시간축/간격으로 늘리거나 줄여 난이도를 만든다. */
function scaleStages(time: number, interval: number): Stage[] {
  return NORMAL_STAGES.map((stage) => ({
    ...stage,
    from: Math.round(stage.from * time),
    intervalMs: Math.round(stage.intervalMs * interval),
  }));
}

export const RULESETS: Record<Difficulty, Ruleset> = {
  easy: {
    perfectWindow: 60,
    goodWindow: 120,
    mirrorEarlyWindow: 660,
    mirrorClashWindow: 110,
    mirrorTightWindow: 260,
    mirrorEnemyOffset: { min: -300, max: 40 },
    approachMs: 1800,
    lives: 5,
    stages: scaleStages(1.6, 1.2),
  },
  normal: {
    perfectWindow: 45,
    goodWindow: 90,
    mirrorEarlyWindow: 520,
    mirrorClashWindow: 120,
    mirrorTightWindow: 220,
    mirrorEnemyOffset: { min: -300, max: 40 },
    approachMs: 1400,
    lives: 3,
    stages: NORMAL_STAGES,
  },
  hard: {
    perfectWindow: 35,
    goodWindow: 70,
    // 간격이 좁아지므로 수락 구간도 같이 줄인다. 안 그러면 앞뒤 큐의 구간이 겹친다.
    mirrorEarlyWindow: 390,
    mirrorClashWindow: 125,
    mirrorTightWindow: 190,
    mirrorEnemyOffset: { min: -250, max: 40 },
    approachMs: 1050,
    lives: 2,
    stages: scaleStages(0.65, 0.85),
  },
};

export function stageAt(rules: Ruleset, elapsed: number): Stage {
  let current = rules.stages[0];
  for (const stage of rules.stages) {
    if (elapsed >= stage.from) current = stage;
  }
  return current;
}

/** 시작 직후 첫 큐가 날아오기 전 준비 시간 (ms). */
export const LEAD_IN_MS = 1600;

/** 판정선을 지난 큐가 화면에서 사라지기까지 (ms). */
export const CULL_AFTER_MS = 260;

/**
 * 자판 배열에 상관없이 물리 키 위치로 받기 위해 event.key가 아닌 event.code를 쓴다.
 */
export const LANE_KEYS: Record<string, Lane> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  KeyF: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyJ: 'right',
};

export const COLORS = {
  field: '#0a0a0a',
  track: 'rgba(255, 255, 255, 0.07)',
  line: 'rgba(255, 255, 255, 0.28)',
  cue: '#ededed',
  player: '#ededed',
  perfect: '#5eead4',
  good: '#94a3b8',
  miss: '#ef4444',
  // MIRROR는 앰버. 실패 색(빨강)과 섞이면 "적 구간"이 어디인지 읽히지 않는다.
  mirror: '#fbbf24',
  ghost: 'rgba(239, 68, 68, 0.7)',
  clashZone: 'rgba(239, 68, 68, 0.2)',
  /** 칠 수 있는 구간. 이걸 칠해놔야 "어디서 누르라는 건지"가 보인다. */
  strikeZone: 'rgba(251, 191, 36, 0.13)',
} as const;
