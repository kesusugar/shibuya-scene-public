import ShibuyaScene from "./ShibuyaScene";

export const dynamic = "force-static";

export default function Page() {
  // 攻撃状態は beauty_split_2 側（kesusugar/beauty_split_2 の attack-state.js）へ移設済み。
  // ここを <AttackState /> で再マウントすると attack-simulation が再び走る（AGENTS.md 参照）。
  return <ShibuyaScene />;
}
