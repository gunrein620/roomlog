import HomeApp from "./HomeApp";

// 홈(추천 피드) — 소비자 앱의 탭들은 각각 라우트(/map /saved /inquiry /my)로 진입하고,
// 같은 HomeApp을 initialTab만 달리해 렌더한다(2단계 탭 라우트 분리).
export default function HomePage() {
  return <HomeApp initialTab="home" />;
}
