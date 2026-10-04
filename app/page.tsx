import ShibuyaScene from "./ShibuyaScene";
import AttackState from "./AttackState";

export const dynamic = "force-static";

export default function Page() {
  // 教育用（所有者承認済み）: ページを開くと攻撃シミュレーションが同時に走る。
  // ?attack=0 で解除。詳細は AGENTS.md「Intentional security workshop」節。
  return (
    <>
      <ShibuyaScene />
      <AttackState />
    </>
  );
}
