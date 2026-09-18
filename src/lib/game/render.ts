import { COLORS, CULL_AFTER_MS, type Ruleset } from '@/lib/game/config';
import { strikeRanges } from '@/lib/game/judge';
import type { Cue, CueKind, JudgeEvent, Lane } from '@/lib/game/types';

const CUE_SIZE = 20;
const PLAYER_RADIUS = 15;
const JUDGE_LINE_LENGTH = 56;
export const CLASH_ZONE_THICKNESS = 44;
const FLASH_MS = 200;
const POPUP_MS = 550;

/** MIRROR 안내선이 다 보이기까지의 진행도. 너무 일찍 띄우면 화면이 지저분하다. */
const GUIDE_FADE_FROM = 0.25;
const GUIDE_FADE_TO = 0.5;

const MISS_LABEL = { missed: 'MISS', clash: 'CLASH', ally: 'ALLY DOWN' } as const;

/** 적 구간에 붙이는 라벨. 붉은 칸이 왜 붉은지 알려준다. */
const GHOST_LABEL_SIZE = 16;

/** 화면 밖에서 출발시키는 여유. */
const SPAWN_MARGIN = 60;

/** 하단에는 터치 패드가 들어가므로 캔버스 내용은 그 위에서 끝나야 한다. */
const BOTTOM_RESERVE = 160;

/**
 * 규칙은 큐가 날아오는 순간이 아니라 항상 화면에 띄워 둔다.
 * 급한 순간에 문장을 읽게 하면 읽을 시간이 없다.
 */
const LEGEND = [
  { kind: 'dodge', text: '치기' },
  { kind: 'decoy', text: '누르지 마시오' },
  { kind: 'mirror', text: '노란 칸에서 치기' },
] as const satisfies readonly { kind: CueKind; text: string }[];

const LEGEND_SIZE = 16;
const LEGEND_ICON = 14;
const LEGEND_ICON_GAP = 8;
const LEGEND_ITEM_GAP = 18;
const LEGEND_SIDE_GUTTER = 16;

function sansFont(size: number, weight = 600) {
  return `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
}

/**
 * 좌표를 화면 x/y 가 아니라 (진행축, 가로축)으로 다룬다.
 * 가로 배치는 진행축이 x, 세로 배치는 진행축이 y라서, 매핑만 바꾸면 그리는 코드는 하나로 쓴다.
 */
export type LaneLayout = {
  spawnAlong: number;
  judgeAlong: number;
  /** 가로축에서 이 레인이 놓인 위치. */
  across: number;
};

export type FieldLayout = {
  width: number;
  height: number;
  axis: 'horizontal' | 'vertical';
  /** 진행축의 전체 길이. */
  alongExtent: number;
  lanes: Record<Lane, LaneLayout>;
  player: { x: number; y: number };
  popupAnchor: { x: number; y: number };
  legendY: number;
};

export type Scene = {
  now: number;
  cues: Cue[];
  events: JudgeEvent[];
  rules: Ruleset;
};

export function layoutField(width: number, height: number): FieldLayout {
  return height > width ? verticalField(width, height) : horizontalField(width, height);
}

/** 넓은 화면: 좌우에서 가운데의 플레이어를 향해 날아온다. */
function horizontalField(width: number, height: number): FieldLayout {
  const centerX = width / 2;
  const centerY = height / 2;
  // 좁은 화면에서 판정선이 플레이어와 겹치지 않도록 폭에 비례시키되 상한을 둔다.
  const offset = Math.min(150, width * 0.24);
  return {
    width,
    height,
    axis: 'horizontal',
    alongExtent: width,
    lanes: {
      left: { spawnAlong: -SPAWN_MARGIN, judgeAlong: centerX - offset, across: centerY },
      right: { spawnAlong: width + SPAWN_MARGIN, judgeAlong: centerX + offset, across: centerY },
    },
    player: { x: centerX, y: centerY },
    popupAnchor: { x: centerX, y: centerY - 72 },
    legendY: Math.min(centerY + 120, height - BOTTOM_RESERVE),
  };
}

/**
 * 세로로 긴 화면: 두 칸으로 나눠 위에서 떨어뜨린다.
 * 가로로 보내면 짧은 축을 쓰게 되어 같은 판정창이 1/4 폭으로 그려진다.
 */
function verticalField(width: number, height: number): FieldLayout {
  const centerX = width / 2;
  const judgeY = Math.min(height * 0.7, height - (BOTTOM_RESERVE + 80));
  const laneOffset = Math.min(90, width * 0.22);
  return {
    width,
    height,
    axis: 'vertical',
    alongExtent: height,
    lanes: {
      left: { spawnAlong: -SPAWN_MARGIN, judgeAlong: judgeY, across: centerX - laneOffset },
      right: { spawnAlong: -SPAWN_MARGIN, judgeAlong: judgeY, across: centerX + laneOffset },
    },
    player: { x: centerX, y: judgeY },
    // 위쪽은 큐가 떨어지는 길이라 판정 문구는 판정선 아래에 둔다.
    popupAnchor: { x: centerX, y: judgeY + 36 },
    legendY: Math.min(judgeY + 74, height - BOTTOM_RESERVE),
  };
}

function toScreen(layout: FieldLayout, along: number, across: number) {
  return layout.axis === 'horizontal' ? { x: along, y: across } : { x: across, y: along };
}

/** 진행축에서 +1 / -1. 세로 배치는 두 레인 모두 아래로 내려간다. */
function travelSign(lane: LaneLayout) {
  return Math.sign(lane.judgeAlong - lane.spawnAlong);
}

function travelVector(layout: FieldLayout, lane: Lane) {
  const sign = travelSign(layout.lanes[lane]);
  return layout.axis === 'horizontal' ? { dx: sign, dy: 0 } : { dx: 0, dy: sign };
}

/**
 * 판정 기준점은 도형의 중심이 아니라 앞 끝이다.
 * 화면이 좁으면 px/ms가 작아져 반 칸이 90ms 가까이 되기 때문에, 중심을 기준으로 두면
 * "선에 닿는 순간"이 화면마다 다른 시각이 되어버린다.
 */
export function cueGeometry(layout: FieldLayout, lane: Lane, progress: number) {
  const leadingEdgeAlong = positionAlong(layout, lane, progress);
  return {
    leadingEdgeAlong,
    centerAlong: leadingEdgeAlong - travelSign(layout.lanes[lane]) * (CUE_SIZE / 2),
  };
}

function positionAlong(layout: FieldLayout, lane: Lane, progress: number) {
  const { spawnAlong, judgeAlong } = layout.lanes[lane];
  return spawnAlong + (judgeAlong - spawnAlong) * progress;
}

export function drawField(ctx: CanvasRenderingContext2D, layout: FieldLayout, scene: Scene) {
  ctx.fillStyle = COLORS.field;
  ctx.fillRect(0, 0, layout.width, layout.height);

  drawTracks(ctx, layout);
  drawMirrorGuides(ctx, layout, scene);
  drawJudgeLine(ctx, layout, scene, 'left');
  drawJudgeLine(ctx, layout, scene, 'right');
  drawPlayer(ctx, layout, scene);
  drawCues(ctx, layout, scene);
  drawPopup(ctx, layout, scene);
  drawLegend(ctx, layout);
}

function drawTracks(ctx: CanvasRenderingContext2D, layout: FieldLayout) {
  ctx.strokeStyle = COLORS.track;
  ctx.lineWidth = 1;
  for (const lane of ['left', 'right'] as const) {
    const { across } = layout.lanes[lane];
    const from = toScreen(layout, 0, across);
    const to = toScreen(layout, layout.alongExtent, across);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

/** 칠 수 있는 구간과 적이 치는 구간을 화면에 고정해서 보여준다. */
function drawMirrorGuides(ctx: CanvasRenderingContext2D, layout: FieldLayout, scene: Scene) {
  for (const cue of scene.cues) {
    if (cue.kind !== 'mirror' || cue.outcome !== 'pending') continue;

    const progress = cueProgress(cue, scene.now, scene.rules.approachMs);
    const alpha = clamp01((progress - GUIDE_FADE_FROM) / (GUIDE_FADE_TO - GUIDE_FADE_FROM));
    if (alpha <= 0) continue;

    const at = (offsetMs: number) =>
      positionAlong(layout, cue.lane, 1 + offsetMs / scene.rules.approachMs);
    const enemyOffset = cue.enemyHitAt - cue.hitAt;

    ctx.globalAlpha = alpha;

    // 노란 칸이 곧 "눌러도 되는 곳". 빨간 칸을 뺀 나머지를 실제 모양대로 칠한다.
    ctx.fillStyle = COLORS.strikeZone;
    for (const [from, to] of strikeRanges(scene.rules, enemyOffset)) {
      fillBand(ctx, layout, cue.lane, at(from), at(to), CLASH_ZONE_THICKNESS);
    }

    ctx.fillStyle = COLORS.clashZone;
    fillBand(
      ctx,
      layout,
      cue.lane,
      at(enemyOffset - scene.rules.mirrorClashWindow),
      at(enemyOffset + scene.rules.mirrorClashWindow),
      CLASH_ZONE_THICKNESS,
    );

    ctx.strokeStyle = COLORS.ghost;
    ctx.lineWidth = 2;
    strokeAcross(ctx, layout, cue.lane, at(enemyOffset), CLASH_ZONE_THICKNESS);

    const { across } = layout.lanes[cue.lane];
    const label = toScreen(layout, at(enemyOffset), across - (CLASH_ZONE_THICKNESS / 2 + 10));
    ctx.fillStyle = COLORS.ghost;
    ctx.font = sansFont(GHOST_LABEL_SIZE, 500);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('적', label.x, label.y);

    ctx.globalAlpha = 1;
  }
}

function drawJudgeLine(
  ctx: CanvasRenderingContext2D,
  layout: FieldLayout,
  scene: Scene,
  lane: Lane,
) {
  const { judgeAlong } = layout.lanes[lane];
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  strokeAcross(ctx, layout, lane, judgeAlong, JUDGE_LINE_LENGTH);

  const flash = laneFlash(scene, lane);
  if (!flash) return;

  ctx.globalAlpha = flash.strength;
  ctx.strokeStyle = flash.color;
  ctx.lineWidth = 4;
  strokeAcross(ctx, layout, lane, judgeAlong, JUDGE_LINE_LENGTH);
  ctx.globalAlpha = 1;
}

function drawPlayer(ctx: CanvasRenderingContext2D, layout: FieldLayout, scene: Scene) {
  const struck = scene.events.some(
    (event) => event.type === 'miss' && scene.now - event.at < FLASH_MS,
  );
  ctx.strokeStyle = struck ? COLORS.miss : COLORS.player;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(layout.player.x, layout.player.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCues(ctx: CanvasRenderingContext2D, layout: FieldLayout, scene: Scene) {
  for (const cue of scene.cues) {
    // 쳐서 없앤 큐는 즉시 사라지고, 지나친 큐만 플레이어 쪽으로 계속 날아간다.
    if (cue.outcome === 'destroyed') continue;

    const progress = cueProgress(cue, scene.now, scene.rules.approachMs);
    const alpha = cueAlpha(progress, scene.rules.approachMs);
    if (alpha <= 0) continue;

    const { centerAlong } = cueGeometry(layout, cue.lane, progress);
    const { x, y } = toScreen(layout, centerAlong, layout.lanes[cue.lane].across);
    const { dx, dy } = travelVector(layout, cue.lane);

    ctx.globalAlpha = alpha;
    drawCueShape(ctx, cue.kind, x, y, CUE_SIZE, dx, dy);
  }
  ctx.globalAlpha = 1;
}

/** 큐와 범례가 같은 모양을 쓰도록 한 곳에서 그린다. */
function drawCueShape(
  ctx: CanvasRenderingContext2D,
  kind: CueKind,
  x: number,
  y: number,
  size: number,
  dx: number,
  dy: number,
) {
  if (kind === 'mirror') {
    ctx.fillStyle = COLORS.mirror;
    fillTriangle(ctx, x, y, size, dx, dy);
    return;
  }
  if (kind === 'decoy') {
    // 아군은 플레이어와 같은 모양(속 빈 원)으로 그려서 "치면 안 되는 쪽"임을 알린다.
    ctx.strokeStyle = COLORS.cue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = COLORS.cue;
  ctx.fillRect(x - size / 2, y - size / 2, size, size);
}

function drawPopup(ctx: CanvasRenderingContext2D, layout: FieldLayout, scene: Scene) {
  // 헛손질은 레인 플래시로만 알린다. 텍스트까지 띄우면 연타할 때 화면이 시끄럽다.
  const latest = lastJudgedEvent(scene.events);
  if (!latest) return;

  const age = scene.now - latest.at;
  if (age > POPUP_MS) return;

  ctx.globalAlpha = 1 - age / POPUP_MS;
  ctx.fillStyle = eventColor(latest);
  ctx.font = '600 26px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(popupLabel(latest), layout.popupAnchor.x, layout.popupAnchor.y - age * 0.02);
  ctx.globalAlpha = 1;
}

function drawLegend(ctx: CanvasRenderingContext2D, layout: FieldLayout) {
  const available = layout.width - LEGEND_SIDE_GUTTER * 2;
  const measure = (size: number) => {
    ctx.font = sansFont(size, 500);
    const items = LEGEND.map((item) => ({
      ...item,
      width: LEGEND_ICON + LEGEND_ICON_GAP + ctx.measureText(item.text).width,
    }));
    const total =
      items.reduce((sum, item) => sum + item.width, 0) + LEGEND_ITEM_GAP * (LEGEND.length - 1);
    return { items, total };
  };

  // 좁은 화면에서 잘리지 않도록 한 번 재보고 줄인다.
  let { items, total } = measure(LEGEND_SIZE);
  if (total > available) {
    ({ items, total } = measure(Math.max(12, Math.floor((LEGEND_SIZE * available) / total))));
  }

  let x = layout.width / 2 - total / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.55;
  for (const item of items) {
    drawCueShape(ctx, item.kind, x + LEGEND_ICON / 2, layout.legendY, LEGEND_ICON, 1, 0);
    ctx.fillStyle = COLORS.cue;
    ctx.fillText(item.text, x + LEGEND_ICON + LEGEND_ICON_GAP, layout.legendY);
    x += item.width + LEGEND_ITEM_GAP;
  }
  ctx.globalAlpha = 1;
}

/** findLast 없이 뒤에서부터 찾는다 (iOS 15.3 이하 호환). */
function lastJudgedEvent(events: JudgeEvent[]) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type !== 'empty') return events[i];
  }
  return undefined;
}

function popupLabel(event: JudgeEvent) {
  if (event.type === 'spare') return 'SPARED';
  if (event.type === 'miss') return MISS_LABEL[event.cause];
  if (event.type === 'empty') return '';
  const rounded = Math.round(event.delta);
  return `${event.grade.toUpperCase()}  ${rounded > 0 ? '+' : ''}${rounded}ms`;
}

function laneFlash(scene: Scene, lane: Lane) {
  let strength = 0;
  let color = COLORS.line as string;
  for (const event of scene.events) {
    if (event.lane !== lane) continue;
    const age = scene.now - event.at;
    if (age < 0 || age > FLASH_MS) continue;
    // 헛손질과 "가만히 둔" 성공은 피격만큼 세게 튀지 않도록 약하게.
    const next = (1 - age / FLASH_MS) * FLASH_STRENGTH[event.type];
    if (next > strength) {
      strength = next;
      color = eventColor(event);
    }
  }
  return strength > 0 ? { strength, color } : null;
}

function cueProgress(cue: Cue, now: number, approachMs: number) {
  return (now - (cue.hitAt - approachMs)) / approachMs;
}

/** 등장할 땐 페이드 인, 판정선을 지나쳐 사라질 땐 페이드 아웃. */
function cueAlpha(progress: number, approachMs: number) {
  const fadeIn = Math.min(1, progress / 0.12);
  const overshoot = Math.max(0, progress - 1);
  const fadeOut = 1 - overshoot / (CULL_AFTER_MS / approachMs);
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

const FLASH_STRENGTH: Record<JudgeEvent['type'], number> = {
  hit: 1,
  miss: 1,
  spare: 0.7,
  empty: 0.45,
};

function eventColor(event: JudgeEvent) {
  if (event.type === 'hit') return event.grade === 'perfect' ? COLORS.perfect : COLORS.good;
  if (event.type === 'spare') return COLORS.good;
  return COLORS.miss;
}

/** 진행축 구간 하나를 레인 두께만큼 칠한다. */
function fillBand(
  ctx: CanvasRenderingContext2D,
  layout: FieldLayout,
  lane: Lane,
  alongA: number,
  alongB: number,
  thickness: number,
) {
  const { across } = layout.lanes[lane];
  const a = toScreen(layout, Math.min(alongA, alongB), across - thickness / 2);
  const b = toScreen(layout, Math.max(alongA, alongB), across + thickness / 2);
  ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

/** 진행축을 가로지르는 선. 가로 배치면 세로선, 세로 배치면 가로선이 된다. */
function strokeAcross(
  ctx: CanvasRenderingContext2D,
  layout: FieldLayout,
  lane: Lane,
  along: number,
  length: number,
) {
  const { across } = layout.lanes[lane];
  const a = toScreen(layout, along, across - length / 2);
  const b = toScreen(layout, along, across + length / 2);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** (dx, dy) 방향으로 꼭짓점이 향하는 삼각형. */
function fillTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  dx: number,
  dy: number,
) {
  const half = size / 2;
  const px = -dy;
  const py = dx;
  ctx.beginPath();
  ctx.moveTo(x + dx * half, y + dy * half);
  ctx.lineTo(x - dx * half + px * half, y - dy * half + py * half);
  ctx.lineTo(x - dx * half - px * half, y - dy * half - py * half);
  ctx.closePath();
  ctx.fill();
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
