import type { Ruleset } from '@/lib/game/config';
import type { Cue, HitGrade, Lane } from '@/lib/game/types';

export type Resolution =
  | { kind: 'hit'; cue: Cue; grade: HitGrade; delta: number }
  /** MIRROR에서 적과 겹쳐 실패. */
  | { kind: 'clash'; cue: Cue }
  /** 아군(DECOY)을 쳐서 실패. */
  | { kind: 'strike'; cue: Cue }
  | { kind: 'empty' };

/** delta = 입력 시각 - 판정선 시각. 윈도우 밖이면 null. */
export function gradeDelta(rules: Ruleset, delta: number): HitGrade | null {
  const offset = Math.abs(delta);
  if (offset <= rules.perfectWindow) return 'perfect';
  if (offset <= rules.goodWindow) return 'good';
  return null;
}

/** 이 큐를 칠 수 있는 구간인지. MIRROR만 이른 쪽이 넓다. */
export function inAcceptWindow(rules: Ruleset, cue: Cue, at: number) {
  const delta = at - cue.hitAt;
  const early = cue.kind === 'mirror' ? rules.mirrorEarlyWindow : rules.goodWindow;
  return delta >= -early && delta <= rules.goodWindow;
}

/** 입력 하나가 무엇을 쳤는지 판정한다. 맞은 큐가 없으면 헛손질. */
export function resolveInput(rules: Ruleset, cues: Cue[], lane: Lane, at: number): Resolution {
  const cue = matchCue(rules, cues, lane, at);
  if (!cue) return { kind: 'empty' };
  if (cue.kind === 'decoy') return { kind: 'strike', cue };

  const delta = at - cue.hitAt;
  if (cue.kind !== 'mirror') {
    const grade = gradeDelta(rules, delta);
    return grade ? { kind: 'hit', cue, grade, delta } : { kind: 'empty' };
  }

  // MIRROR는 판정선이 아니라 적의 타격 시각을 기준으로 채점한다.
  const gap = Math.abs(at - cue.enemyHitAt);
  if (gap <= rules.mirrorClashWindow) return { kind: 'clash', cue };
  return {
    kind: 'hit',
    cue,
    grade: gap <= rules.mirrorTightWindow ? 'perfect' : 'good',
    delta,
  };
}

/** 수락 구간에서 적 구간을 뺀 나머지. 적 위치에 따라 한 덩이일 수도 두 덩이일 수도 있다. */
export function strikeRanges(rules: Ruleset, enemyOffset: number): [number, number][] {
  const clashFrom = enemyOffset - rules.mirrorClashWindow;
  const clashTo = enemyOffset + rules.mirrorClashWindow;
  const ranges: [number, number][] = [
    [-rules.mirrorEarlyWindow, Math.min(rules.goodWindow, clashFrom)],
    [Math.max(-rules.mirrorEarlyWindow, clashTo), rules.goodWindow],
  ];
  return ranges.filter(([from, to]) => to > from);
}

/** 같은 레인에서 아직 판정되지 않았고 수락 구간 안에 있는 것 중 가장 가까운 큐. */
function matchCue(rules: Ruleset, cues: Cue[], lane: Lane, at: number): Cue | undefined {
  let nearest: Cue | undefined;
  let nearestOffset = Infinity;
  for (const cue of cues) {
    if (cue.outcome !== 'pending' || cue.lane !== lane) continue;
    if (!inAcceptWindow(rules, cue, at)) continue;
    const offset = Math.abs(at - cue.hitAt);
    if (offset < nearestOffset) {
      nearest = cue;
      nearestOffset = offset;
    }
  }
  return nearest;
}
