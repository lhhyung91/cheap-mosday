import { LEAD_IN_MS, stageAt, type Ruleset, type Stage } from '@/lib/game/config';
import type { Cue, Lane } from '@/lib/game/types';

export class Spawner {
  private nextId = 1;
  private nextHitAt: number;
  private lastLane: Lane | null = null;
  private laneRepeat = 0;

  constructor(private readonly rules: Ruleset) {
    this.nextHitAt = LEAD_IN_MS + rules.approachMs;
  }

  /** 화면에 들어올 때가 된 큐를 꺼낸다. */
  take(now: number): Cue[] {
    const spawned: Cue[] = [];
    while (this.nextHitAt - this.rules.approachMs <= now) {
      // 스폰 시점이 아니라 판정 시점 기준으로 난이도를 고른다.
      const stage = stageAt(this.rules, this.nextHitAt);
      spawned.push(...this.makeCues(this.nextHitAt, stage));
      this.nextHitAt += stage.intervalMs;
    }
    return spawned;
  }

  private makeCues(hitAt: number, stage: Stage): Cue[] {
    if (Math.random() < stage.doubleChance) {
      // 좌우 동시에 MIRROR까지 읽을 수는 없으므로, 동시 큐는 쳐낼 것과 아군만 섞는다.
      this.lastLane = null;
      this.laneRepeat = 0;
      return (['left', 'right'] as const).map((lane) =>
        Math.random() < stage.decoyChance ? this.decoy(lane, hitAt) : this.dodge(lane, hitAt),
      );
    }

    const lane = this.pickLane();
    const roll = Math.random();
    if (roll < stage.decoyChance) return [this.decoy(lane, hitAt)];
    if (roll < stage.decoyChance + stage.mirrorChance) return [this.mirror(lane, hitAt)];
    return [this.dodge(lane, hitAt)];
  }

  private dodge(lane: Lane, hitAt: number): Cue {
    return { id: this.nextId++, kind: 'dodge', lane, hitAt, outcome: 'pending' };
  }

  private decoy(lane: Lane, hitAt: number): Cue {
    return { id: this.nextId++, kind: 'decoy', lane, hitAt, outcome: 'pending' };
  }

  private mirror(lane: Lane, hitAt: number): Cue {
    const { min, max } = this.rules.mirrorEnemyOffset;
    return {
      id: this.nextId++,
      kind: 'mirror',
      lane,
      hitAt,
      enemyHitAt: hitAt + min + Math.random() * (max - min),
      outcome: 'pending',
    };
  }

  /** 순수 난수는 한쪽으로 길게 몰려서 단조로워지므로 3연속에서 끊는다. */
  private pickLane(): Lane {
    let lane: Lane = Math.random() < 0.5 ? 'left' : 'right';
    if (lane === this.lastLane && this.laneRepeat >= 2) {
      lane = lane === 'left' ? 'right' : 'left';
    }
    this.laneRepeat = lane === this.lastLane ? this.laneRepeat + 1 : 0;
    this.lastLane = lane;
    return lane;
  }
}
