import { Card } from "@roomlog/ui";
import { sectionTitle } from "../../_components/ticket-manager-ui";
import { AttachmentThumbnailGallery } from "./AttachmentThumbnailGallery";

export function TicketEvidenceGallery({
  attachmentUrls,
}: {
  attachmentUrls: string[];
}) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <div style={sectionTitle}>사진 비교·근거</div>
      <AttachmentThumbnailGallery
        attachmentUrls={attachmentUrls}
        emptyMessage="조회할 사진 비교·근거 내용이 없습니다."
      />
    </Card>
  );
}
