export type Lane = 'left' | 'right';

export type HitGrade = 'perfect' | 'good';

type CueBase = {
  id: number;
  lane: Lane;
  /** 판정선에 정확히 닿는 시각 (게임 시작 기준 ms). */
  hitAt: number;
  /** destroyed=쳐서 없앰(화면에서 사라짐), passed=플레이어를 지나쳐 감. */
  outcome: 'pending' | 'destroyed' | 'passed';
};

export type Cue = CueBase &
  (
    | { kind: 'dodge' }
    /** enemyHitAt 근처에 누르면 적과 부딪혀 실패한다. */
    | { kind: 'mirror'; enemyHitAt: number }
    /** 아군. 누르면 안 된다. */
    | { kind: 'decoy' }
  );

export type CueKind = Cue['kind'];

/**
 * 결과에 따라 대가가 다르므로 나눠 둔다.
 * hit=쳐냄, spare=아군을 지나보냄, miss=라이프 감소, empty=헛손질(콤보만 끊김).
 */
export type JudgeEvent =
  | { type: 'hit'; lane: Lane; at: number; grade: HitGrade; delta: number }
  | { type: 'spare'; lane: Lane; at: number }
  | { type: 'miss'; lane: Lane; at: number; cause: MissCause }
  | { type: 'empty'; lane: Lane; at: number };

/** missed=큐를 놓침, clash=적과 부딪힘, ally=아군을 침. */
export type MissCause = 'missed' | 'clash' | 'ally';
