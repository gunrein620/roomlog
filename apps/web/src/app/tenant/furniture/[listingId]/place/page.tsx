import { PlacementPlanner } from "./PlacementPlanner";

export default async function TenantFurniturePlacementPage({
  params
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  return <PlacementPlanner listingId={listingId} />;
}
