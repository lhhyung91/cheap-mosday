'use client';

import { TouchPads } from '@/components/TouchPads';
import type { Ruleset } from '@/lib/game/config';
import { GameEngine } from '@/lib/game/engine';
import type { JudgeEvent } from '@/lib/game/types';
import { useEffect, useRef } from 'react';

type GameCanvasProps = {
  running: boolean;
  rules: Ruleset;
  onJudge: (event: JudgeEvent) => void;
};

export function GameCanvas({ running, rules, onJudge }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GameEngine(canvas, rules, onJudge);
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [rules, onJudge]);

  useEffect(() => {
    if (!running) engineRef.current?.pause();
  }, [running]);

  return (
    <>
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      {running && (
        <TouchPads onPress={(lane, timeStamp) => engineRef.current?.press(lane, timeStamp)} />
      )}
    </>
  );
}
