import { formatTime } from '@/lib/format';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  LEAD_IN_MS,
  RULESETS,
  stageAt,
  type Ruleset,
} from '@/lib/game/config';
import { gradeDelta, resolveInput, strikeRanges } from '@/lib/game/judge';
import { CLASH_ZONE_THICKNESS, cueGeometry, layoutField } from '@/lib/game/render';
import { applyJudge, comboMultiplier, createRun, type RunState } from '@/lib/game/score';
import { Spawner } from '@/lib/game/spawner';
import type { Cue, JudgeEvent, Lane } from '@/lib/game/types';

const rules: Ruleset = RULESETS.normal;
const {
  perfectWindow: PERFECT_WINDOW,
  goodWindow: GOOD_WINDOW,
  mirrorEarlyWindow: MIRROR_EARLY_WINDOW,
  mirrorClashWindow: MIRROR_CLASH_WINDOW,
  mirrorTightWindow: MIRROR_TIGHT_WINDOW,
  mirrorEnemyOffset: MIRROR_ENEMY_OFFSET,
  approachMs: APPROACH_MS,
  lives: STARTING_LIVES,
} = rules;
const DIFFICULTY = rules.stages;

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  const detail = ok ? '' : ` (기대 ${JSON.stringify(expected)})`;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ->  ${JSON.stringify(actual)}${detail}`);
}

const cue = (id: number, lane: Lane, hitAt: number, outcome: Cue['outcome'] = 'pending'): Cue => ({
  id,
  kind: 'dodge',
  lane,
  hitAt,
  outcome,
});

const decoy = (id: number, lane: Lane, hitAt: number): Cue => ({
  id,
  kind: 'decoy',
  lane,
  hitAt,
  outcome: 'pending',
});

const mirror = (id: number, lane: Lane, hitAt: number, enemyOffset: number): Cue => ({
  id,
  kind: 'mirror',
  lane,
  hitAt,
  enemyHitAt: hitAt + enemyOffset,
  outcome: 'pending',
});

const hit = (lane: Lane, grade: 'perfect' | 'good'): JudgeEvent => ({
  type: 'hit',
  lane,
  at: 0,
  grade,
  delta: 0,
});
const missed: JudgeEvent = { type: 'miss', lane: 'left', at: 0, cause: 'missed' };
const clashed: JudgeEvent = { type: 'miss', lane: 'left', at: 0, cause: 'clash' };
const allyDown: JudgeEvent = { type: 'miss', lane: 'left', at: 0, cause: 'ally' };
const spare: JudgeEvent = { type: 'spare', lane: 'left', at: 0 };
const empty: JudgeEvent = { type: 'empty', lane: 'left', at: 0 };

console.log('--- gradeDelta 경계 ---');
check('정확히 0ms', gradeDelta(rules, 0), 'perfect');
check(`PERFECT 경계 ${PERFECT_WINDOW}ms`, gradeDelta(rules, PERFECT_WINDOW), 'perfect');
check('PERFECT 경계 +1ms', gradeDelta(rules, PERFECT_WINDOW + 1), 'good');
check(`GOOD 경계 ${GOOD_WINDOW}ms`, gradeDelta(rules, GOOD_WINDOW), 'good');
check('GOOD 경계 +1ms는 판정 없음', gradeDelta(rules, GOOD_WINDOW + 1), null);
check('이른 입력도 대칭', gradeDelta(rules, -PERFECT_WINDOW), 'perfect');
check('많이 이른 입력', gradeDelta(rules, -GOOD_WINDOW - 1), null);

console.log('\n--- resolveInput ---');
const cues = [cue(1, 'left', 1000), cue(2, 'left', 1120), cue(3, 'right', 1000)];
check('가장 가까운 큐를 고른다', resolveInput(rules, cues, 'left', 1080), {
  kind: 'hit',
  cue: cues[1],
  grade: 'perfect',
  delta: -40,
});
check('같은 큐를 GOOD 거리에서 치면 GOOD', resolveInput(rules, cues, 'left', 1050).kind, 'hit');
check('GOOD 등급 확인', gradeDelta(rules, 1050 - 1120), 'good');
check('조금 더 이르면 앞 큐', resolveInput(rules, cues, 'left', 1030).kind === 'hit', true);
check('다른 레인은 무시', resolveInput(rules, cues, 'right', 1000).kind, 'hit');
check('윈도우 밖이면 헛손질', resolveInput(rules, cues, 'left', 1600), { kind: 'empty' });
check(
  '이미 판정된 큐는 건너뛴다',
  resolveInput(rules, [cue(1, 'left', 1000, 'destroyed'), cue(2, 'left', 1400)], 'left', 1010),
  { kind: 'empty' },
);
check(
  '지나간 큐는 다시 칠 수 없다',
  resolveInput(rules, [cue(1, 'left', 1000, 'passed')], 'left', 1010),
  {
    kind: 'empty',
  },
);

console.log('\n--- Spawner ---');
const spawner = new Spawner(rules);
const spawned: Cue[] = [];
for (let now = 0; now <= 90_000; now += 16) spawned.push(...spawner.take(now));

check('첫 큐의 판정 시각', spawned[0].hitAt, LEAD_IN_MS + APPROACH_MS);
check('1단계 큐 간격', spawned[1].hitAt - spawned[0].hitAt, DIFFICULTY[0].intervalMs);
check('양쪽 레인이 모두 나온다', new Set(spawned.map((c) => c.lane)).size, 2);

// 동시 큐는 양쪽 레인을 다 쓰므로 연속 카운트가 거기서 끊긴다.
const byHitAt = [...new Set(spawned.map((c) => c.hitAt))]
  .sort((a, b) => a - b)
  .map((hitAt) => spawned.filter((c) => c.hitAt === hitAt));
let maxRepeat = 0;
let streak = 0;
let previousLane: Lane | null = null;
for (const group of byHitAt) {
  if (group.length > 1) {
    previousLane = null;
    streak = 0;
    continue;
  }
  streak = group[0].lane === previousLane ? streak + 1 : 1;
  previousLane = group[0].lane;
  maxRepeat = Math.max(maxRepeat, streak);
}
check('같은 레인 최대 연속이 3 이하', maxRepeat <= 3, true);
check('연속 표본이 실제로 있다', maxRepeat > 0, true);

console.log('\n--- 난이도 곡선 ---');
check(
  '단계 경계',
  [0, 9_999, 10_000, 19_999, 20_000, 35_000, 60_000, 120_000].map((t) => stageAt(rules, t).from),
  [0, 0, 10_000, 10_000, 20_000, 35_000, 60_000, 60_000],
);
check(
  'decoy + mirror 확률 합이 1을 넘지 않는다',
  DIFFICULTY.every((stage) => stage.decoyChance + stage.mirrorChance <= 1),
  true,
);
check(
  '20초 전에는 MIRROR가 없다',
  spawned.filter((c) => c.hitAt < 20_000).every((c) => c.kind !== 'mirror'),
  true,
);
check(
  '20초 뒤에는 MIRROR가 섞인다',
  spawned.some((c) => c.hitAt >= 20_000 && c.kind === 'mirror'),
  true,
);
check(
  '세 종류가 모두 나온다',
  (['dodge', 'decoy', 'mirror'] as const).map((kind) => spawned.some((c) => c.kind === kind)),
  [true, true, true],
);
check(
  '적 타격 시각은 설정 범위 안',
  spawned
    .filter((c) => c.kind === 'mirror')
    .every((c) => {
      const offset = c.enemyHitAt - c.hitAt;
      return offset >= MIRROR_ENEMY_OFFSET.min && offset <= MIRROR_ENEMY_OFFSET.max;
    }),
  true,
);

const doubles = [...new Set(spawned.map((c) => c.hitAt))].filter(
  (hitAt) => spawned.filter((c) => c.hitAt === hitAt).length > 1,
);
check(
  '1단계에는 DECOY도 없다',
  spawned.filter((c) => c.hitAt < 10_000).every((c) => c.kind === 'dodge'),
  true,
);
check(
  '10초 뒤에는 DECOY가 섞인다',
  spawned.some((c) => c.hitAt >= 10_000 && c.kind === 'decoy'),
  true,
);
check('동시 큐 표본이 실제로 있다', doubles.length > 0, true);
check(
  '동시 큐는 35초 이후에만',
  doubles.every((hitAt) => hitAt >= 35_000),
  true,
);
check(
  '동시 큐는 좌우 한 쌍이고 MIRROR가 없다',
  doubles.every((hitAt) => {
    const pair = spawned.filter((c) => c.hitAt === hitAt);
    return (
      pair.length === 2 &&
      pair.every((c) => c.kind !== 'mirror') &&
      new Set(pair.map((c) => c.lane)).size === 2
    );
  }),
  true,
);

console.log('\n--- MIRROR 판정 ---');
const onLine = [mirror(1, 'left', 1000, 0)];
check(
  '적이 판정선에 있으면 판정선에서 누르면 부딪힌다',
  resolveInput(rules, onLine, 'left', 1000).kind,
  'clash',
);
check(
  `부딪힘 경계 ${MIRROR_CLASH_WINDOW}ms 안쪽`,
  resolveInput(rules, onLine, 'left', 1000 - MIRROR_CLASH_WINDOW).kind,
  'clash',
);
check(
  '부딪힘 경계 바로 밖은 PERFECT',
  resolveInput(rules, onLine, 'left', 1000 - MIRROR_CLASH_WINDOW - 1),
  { kind: 'hit', cue: onLine[0], grade: 'perfect', delta: -MIRROR_CLASH_WINDOW - 1 },
);
check(
  `적에게서 ${MIRROR_TIGHT_WINDOW}ms 넘게 떨어지면 GOOD`,
  resolveInput(rules, onLine, 'left', 1000 - MIRROR_TIGHT_WINDOW - 1).kind === 'hit' &&
    resolveInput(rules, onLine, 'left', 1000 - MIRROR_TIGHT_WINDOW - 1),
  { kind: 'hit', cue: onLine[0], grade: 'good', delta: -MIRROR_TIGHT_WINDOW - 1 },
);
check(
  `이른 쪽 수락 한계 ${MIRROR_EARLY_WINDOW}ms`,
  resolveInput(rules, onLine, 'left', 1000 - MIRROR_EARLY_WINDOW).kind,
  'hit',
);
check(
  '그보다 이르면 헛손질',
  resolveInput(rules, onLine, 'left', 1000 - MIRROR_EARLY_WINDOW - 1).kind,
  'empty',
);
// 적이 판정선에 서면 "선에 맞춰 누르는" 반사는 늦은 쪽 끝까지 전부 실패한다.
check(
  '적이 판정선이면 늦은 쪽 전체가 부딪힘',
  [0, 45, GOOD_WINDOW].map((late) => resolveInput(rules, onLine, 'left', 1000 + late).kind),
  ['clash', 'clash', 'clash'],
);

const early = [mirror(2, 'right', 2000, -300)];
check('적이 이르면 판정선에서 쳐도 통과', resolveInput(rules, early, 'right', 2000).kind, 'hit');
check(
  '적이 이를 때 그 시각에 누르면 부딪힌다',
  resolveInput(rules, early, 'right', 1700).kind,
  'clash',
);
check(
  `늦은 쪽 수락 한계 ${GOOD_WINDOW}ms`,
  resolveInput(rules, early, 'right', 2000 + GOOD_WINDOW).kind,
  'hit',
);
check(
  '그보다 늦으면 헛손질',
  resolveInput(rules, early, 'right', 2000 + GOOD_WINDOW + 1).kind,
  'empty',
);

console.log('\n--- MIRROR 노란 칸 (화면에 칠하는 구간) ---');
const offsets: number[] = [];
for (let e = MIRROR_ENEMY_OFFSET.min; e <= MIRROR_ENEMY_OFFSET.max; e += 5) offsets.push(e);

// 화면에 칠한 노란 칸 안에서 누르면 반드시 성공해야 한다. 어긋나면 플레이어가 속는다.
const mismatched = offsets.flatMap((e) => {
  const cues = [mirror(100, 'left', 10_000, e)];
  return strikeRanges(rules, e).flatMap(([from, to]) => {
    const samples = [from + 1, (from + to) / 2, to - 1];
    return samples
      .map((offset) => ({
        e,
        offset,
        kind: resolveInput(rules, cues, 'left', 10_000 + offset).kind,
      }))
      .filter((sample) => sample.kind !== 'hit');
  });
});
check('노란 칸 안은 전부 성공 판정', mismatched.slice(0, 3), []);

const insideClash = offsets.filter(
  (e) => resolveInput(rules, [mirror(101, 'left', 10_000, e)], 'left', 10_000 + e).kind !== 'clash',
);
check('적 위치에서 누르면 전부 부딪힘', insideClash, []);

const outsideBand = offsets.filter((e) => {
  const cues = [mirror(102, 'left', 10_000, e)];
  return (
    resolveInput(rules, cues, 'left', 10_000 - MIRROR_EARLY_WINDOW - 1).kind !== 'empty' ||
    resolveInput(rules, cues, 'left', 10_000 + GOOD_WINDOW + 1).kind !== 'empty'
  );
});
check('수락 구간 밖은 전부 헛손질', outsideBand, []);

// "갭이 너무 좁다"를 숫자로 묶어둔다. 가장 넓은 한 덩이가 이만큼은 돼야 노릴 수 있다.
const widest = offsets.map((e) =>
  Math.max(...strikeRanges(rules, e).map(([from, to]) => to - from)),
);
const totals = offsets.map((e) =>
  strikeRanges(rules, e).reduce((sum, [from, to]) => sum + (to - from), 0),
);
check(
  `가장 좁을 때도 한 덩이가 180ms 이상 (실제 ${Math.round(Math.min(...widest))}ms)`,
  Math.min(...widest) >= 180,
  true,
);
check(
  `합계는 항상 300ms 이상 (실제 ${Math.round(Math.min(...totals))}ms)`,
  Math.min(...totals) >= 300,
  true,
);
check('노란 칸은 최대 두 덩이', Math.max(...offsets.map((e) => strikeRanges(rules, e).length)), 2);

console.log('\n--- 배치와 판정선 ---');
const viewports = [
  { label: '데스크탑 1280x720', width: 1280, height: 720, axis: 'horizontal' },
  { label: '노트북 922x550', width: 922, height: 550, axis: 'horizontal' },
  { label: '폰 가로 812x375', width: 812, height: 375, axis: 'horizontal' },
  { label: '폰 세로 375x812', width: 375, height: 812, axis: 'vertical' },
  { label: '태블릿 세로 768x1024', width: 768, height: 1024, axis: 'vertical' },
] as const;
const lanes: Lane[] = ['left', 'right'];
const everyLane = <T,>(pick: (width: number, height: number, lane: Lane) => T) =>
  viewports.flatMap((v) => lanes.map((lane) => pick(v.width, v.height, lane)));

check(
  '화면이 세로로 길면 세로 낙하',
  viewports.map((v) => layoutField(v.width, v.height).axis),
  viewports.map((v) => v.axis),
);

// 판정 시각에 도형의 앞 끝이 판정선에 정확히 닿아야 한다. 배치와 화면 크기에 무관하게.
const contactError = everyLane((width, height, lane) => {
  const layout = layoutField(width, height);
  const gap = cueGeometry(layout, lane, 1).leadingEdgeAlong - layout.lanes[lane].judgeAlong;
  return Math.round(gap * 1000) / 1000;
});
check(
  '닿는 순간이 곧 판정 시각',
  contactError,
  contactError.map(() => 0),
);

const drawnBehind = everyLane((width, height, lane) => {
  const layout = layoutField(width, height);
  const { judgeAlong, spawnAlong } = layout.lanes[lane];
  const sign = Math.sign(judgeAlong - spawnAlong);
  return Math.round((judgeAlong - cueGeometry(layout, lane, 1).centerAlong) * sign);
});
check(
  '중심은 판정선 뒤쪽 10px',
  drawnBehind,
  drawnBehind.map(() => 10),
);

// 세로 배치는 두 레인이 나란히 내려간다.
const verticalLanes = layoutField(375, 812).lanes;
check(
  '세로 배치는 두 레인 모두 같은 방향',
  [
    Math.sign(verticalLanes.left.judgeAlong - verticalLanes.left.spawnAlong),
    Math.sign(verticalLanes.right.judgeAlong - verticalLanes.right.spawnAlong),
  ],
  [1, 1],
);
check(
  '가로 배치는 두 레인이 마주 본다',
  (() => {
    const l = layoutField(922, 550).lanes;
    return [
      Math.sign(l.left.judgeAlong - l.left.spawnAlong),
      Math.sign(l.right.judgeAlong - l.right.spawnAlong),
    ];
  })(),
  [1, -1],
);

// 레인 띠가 화면 밖으로 나가면 안 된다.
const half = CLASH_ZONE_THICKNESS / 2;
const outOfBounds = viewports.filter((v) => {
  const layout = layoutField(v.width, v.height);
  const acrossExtent = layout.axis === 'horizontal' ? v.height : v.width;
  return lanes.some((lane) => {
    const { across } = layout.lanes[lane];
    return across - half < 0 || across + half > acrossExtent;
  });
});
check(
  '레인 띠가 화면 안에 들어간다',
  outOfBounds.map((v) => v.label),
  [],
);

// 가로 배치는 두 레인이 같은 트랙을 쓰고 진행축 양끝으로 갈라진다.
// 세로 배치는 나란히 내려오므로 가로축으로 떨어져 있어야 겹치지 않는다.
const tooClose = viewports.filter((v) => {
  const layout = layoutField(v.width, v.height);
  const [a, b] = lanes.map((lane) => layout.lanes[lane]);
  return layout.axis === 'vertical'
    ? Math.abs(a.across - b.across) < CLASH_ZONE_THICKNESS
    : Math.abs(a.judgeAlong - b.judgeAlong) < CLASH_ZONE_THICKNESS;
});
check(
  '두 레인이 서로 겹치지 않는다',
  tooClose.map((v) => v.label),
  [],
);

// 세로 낙하를 도입한 이유. 폰 세로에서 데스크탑보다 촘촘하면 안 된다.
const pxPerMs = (width: number, height: number) => {
  const { judgeAlong, spawnAlong } = layoutField(width, height).lanes.left;
  return Math.abs(judgeAlong - spawnAlong) / APPROACH_MS;
};
const phone = pxPerMs(375, 812);
const desktop = pxPerMs(1280, 720);
check(
  `폰 세로(${phone.toFixed(3)} px/ms)가 데스크탑(${desktop.toFixed(3)})보다 촘촘하지 않다`,
  phone >= desktop,
  true,
);

console.log('\n--- DECOY 판정 ---');
const ally = [decoy(9, 'left', 5000)];
check('판정선에서 누르면 아군을 친다', resolveInput(rules, ally, 'left', 5000).kind, 'strike');
check(
  `${GOOD_WINDOW}ms 안쪽이면 아군을 친다`,
  resolveInput(rules, ally, 'left', 5000 - GOOD_WINDOW).kind,
  'strike',
);
check(
  '그 밖이면 그냥 헛손질',
  resolveInput(rules, ally, 'left', 5000 + GOOD_WINDOW + 1).kind,
  'empty',
);
check(
  '반대 레인 입력은 아군을 건드리지 않는다',
  resolveInput(rules, ally, 'right', 5000).kind,
  'empty',
);

check(
  'DODGE와 MIRROR가 섞여 있으면 가까운 쪽',
  resolveInput(rules, [cue(3, 'left', 1000), mirror(4, 'left', 1300, 0)], 'left', 1010).kind ===
    'hit',
  true,
);

console.log('\n--- 점수 / 콤보 / 라이프 ---');
check('콤보 배수', [0, 9, 10, 19, 20].map(comboMultiplier), [1, 1, 1.5, 1.5, 2]);

const tenPerfect = Array.from({ length: 10 }).reduce<RunState>(
  (run) => applyJudge(run, hit('left', 'perfect')),
  createRun(STARTING_LIVES),
);
check('PERFECT 10연타 점수 (10번째부터 ×1.5)', tenPerfect.score, 9 * 100 + 150);
check('콤보와 최고 콤보', [tenPerfect.combo, tenPerfect.bestCombo], [10, 10]);
check('라이프는 그대로', tenPerfect.lives, STARTING_LIVES);

check('GOOD은 절반 점수', applyJudge(createRun(STARTING_LIVES), hit('left', 'good')).score, 50);

const afterEmpty = applyJudge(tenPerfect, empty);
check('헛손질은 콤보만 끊는다', [afterEmpty.combo, afterEmpty.lives], [0, STARTING_LIVES]);
check('최고 콤보는 남는다', afterEmpty.bestCombo, 10);
check('점수는 유지', afterEmpty.score, tenPerfect.score);

const afterMiss = applyJudge(tenPerfect, missed);
check('피격은 라이프를 깎는다', [afterMiss.combo, afterMiss.lives], [0, STARTING_LIVES - 1]);

const dead = Array.from({ length: STARTING_LIVES }).reduce<RunState>(
  (run) => applyJudge(run, missed),
  createRun(STARTING_LIVES),
);
check(
  '부딪힘도 피격과 같은 대가',
  applyJudge(createRun(STARTING_LIVES), clashed).lives,
  STARTING_LIVES - 1,
);
check(
  '아군 타격도 피격과 같은 대가',
  applyJudge(createRun(STARTING_LIVES), allyDown).lives,
  STARTING_LIVES - 1,
);

const spared = applyJudge(createRun(STARTING_LIVES), spare);
check('아군을 지나보내면 점수와 콤보', [spared.score, spared.combo], [50, 1]);
check(
  '지나보내기도 콤보 배수를 탄다',
  Array.from({ length: 10 }).reduce<RunState>(
    (run) => applyJudge(run, spare),
    createRun(STARTING_LIVES),
  ).score,
  9 * 50 + 75,
);
check(`피격 ${STARTING_LIVES}번이면 게임오버`, dead.lives, 0);
check(
  '살아 있는 동안 종료 시각은 비어 있다',
  applyJudge(createRun(STARTING_LIVES), missed).endedAt,
  null,
);
check(
  '게임오버 시각은 마지막 판정의 시각',
  Array.from({ length: STARTING_LIVES }).reduce<RunState>(
    (run, _, index) => applyJudge(run, { ...missed, at: (index + 1) * 1000 }),
    createRun(STARTING_LIVES),
  ).endedAt,
  STARTING_LIVES * 1000,
);

console.log('\n--- 시간 표시 ---');
check('formatTime', [0, 950, 38_240, 61_000, 605_400].map(formatTime), [
  '0:00.0',
  '0:00.9',
  '0:38.2',
  '1:01.0',
  '10:05.4',
]);
check('게임오버 뒤 들어온 판정은 무시', applyJudge(dead, hit('left', 'perfect')), dead);

console.log('\n--- 난이도 세 종류 ---');

function widestStrikeRange(preset: Ruleset) {
  let min = Infinity;
  for (let e = preset.mirrorEnemyOffset.min; e <= preset.mirrorEnemyOffset.max; e += 5) {
    const widest = Math.max(...strikeRanges(preset, e).map(([from, to]) => to - from));
    min = Math.min(min, widest);
  }
  return Math.round(min);
}

const presets = DIFFICULTIES.map((level) => ({ level, preset: RULESETS[level] }));

check(
  '판정창 순서 (perfect < good)',
  presets.every(({ preset }) => preset.perfectWindow < preset.goodWindow),
  true,
);
check(
  '부딪힘 구간이 PERFECT 경계보다 안쪽',
  presets.every(({ preset }) => preset.mirrorClashWindow < preset.mirrorTightWindow),
  true,
);
check(
  '라이프는 최소 1',
  presets.every(({ preset }) => preset.lives >= 1),
  true,
);
check(
  '단계는 시간순이고 확률 합이 1 이하',
  presets.every(({ preset }) =>
    preset.stages.every(
      (stage, i) =>
        (i === 0 || stage.from > preset.stages[i - 1].from) &&
        stage.decoyChance + stage.mirrorChance <= 1,
    ),
  ),
  true,
);

// MIRROR 수락 구간이 큐 간격보다 길면 앞뒤 큐의 구간이 겹쳐 엉뚱한 큐가 맞는다.
const bandTooWide = presets.filter(({ preset }) => {
  const minInterval = Math.min(...preset.stages.map((stage) => stage.intervalMs));
  return preset.mirrorEarlyWindow >= minInterval;
});
check(
  'MIRROR 수락 구간 < 최소 큐 간격',
  bandTooWide.map((p) => p.level),
  [],
);

// 같은 레인의 이웃 큐가 동시에 판정창에 들어오면 안 된다.
const windowTooWide = presets.filter(({ preset }) => {
  const minInterval = Math.min(...preset.stages.map((stage) => stage.intervalMs));
  return preset.goodWindow * 2 >= minInterval;
});
check(
  '판정창 폭 < 최소 큐 간격',
  windowTooWide.map((p) => p.level),
  [],
);

const widths = presets.map(({ preset }) => widestStrikeRange(preset));
check(
  `노란 칸이 가장 좁을 때 (하/중/상 = ${widths.join(' / ')}ms)`,
  widths.every((w) => w >= 100),
  true,
);
check(
  '난이도가 올라갈수록 노란 칸이 좁아진다',
  widths[0] > widths[1] && widths[1] > widths[2],
  true,
);

const approaches = presets.map(({ preset }) => preset.approachMs);
check(
  `접근 시간 (하/중/상 = ${approaches.join(' / ')}ms)`,
  approaches[0] > approaches[1] && approaches[1] > approaches[2],
  true,
);

// 난이도마다 실제로 큐가 나오고, 첫 큐 시각이 접근 시간을 따라간다.
const perDifficulty = presets.map(({ level, preset }) => {
  const spawner = new Spawner(preset);
  const cues: Cue[] = [];
  for (let now = 0; now <= 90_000; now += 16) cues.push(...spawner.take(now));
  return {
    level,
    label: DIFFICULTY_LABEL[level],
    firstHitAt: cues[0].hitAt,
    expectedFirst: LEAD_IN_MS + preset.approachMs,
    kinds: new Set(cues.map((c) => c.kind)).size,
  };
});
check(
  '첫 큐 시각 = 준비 시간 + 접근 시간',
  perDifficulty.map((d) => d.firstHitAt === d.expectedFirst),
  perDifficulty.map(() => true),
);
check(
  '난이도마다 세 종류가 모두 나온다',
  perDifficulty.map((d) => d.kinds),
  perDifficulty.map(() => 3),
);

console.log(failures === 0 ? '\n전부 통과' : `\n실패 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
