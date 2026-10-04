"use client";
// 【教育用・意図的】本番ページを「開いた瞬間に攻撃されている状態」にする。
// 実体は src/security/attack-simulation.mjs（反射型XSSシンク・キーロガー・改ざん演出）。
// 所有者承認済みの意図的な組み込みのため、AGENTS.md の該当節を参照。
// アンマウント時は全リスナー・DOM が解除される（リザレクトなし）。
import { useEffect } from 'react';
import { startAttackSimulation } from '../src/security/attack-simulation.mjs';

export default function AttackState() {
  useEffect(() => {
    const sim = startAttackSimulation();
    return () => sim.dispose();
  }, []);
  return null;
}
