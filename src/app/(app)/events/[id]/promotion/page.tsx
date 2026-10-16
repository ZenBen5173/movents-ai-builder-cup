import { query } from "@/lib/db";
import { Card } from "@/components/app/ui";
import { PromoChecklist } from "@/components/app/promo-checklist";
import { MarketingKit } from "@/components/app/marketing-kit";
import { imageHref, isVideo } from "@/lib/marketing";
import { nanoBananaEnabled } from "@/lib/integrations/nanobanana";
import { blobEnabled } from "@/lib/storage";
import type { Creative } from "@/lib/types";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

const ORDER = ["poster", "ig_post", "ig_story", "linkedin", "video"];

export default async function PromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const items = await query<{ id: string; channel: string; title: string; due_date: string; status: string; link: string | null }>("SELECT * FROM promo_items WHERE event_id = $1 ORDER BY due_date", [id]);
  const creatives = (await query<Creative>(
    // Only the first bytes of image_data: enough to tell video from image without loading multi-MB posters.
    "SELECT id, event_id, kind, channel, title, caption, hashtags, image_prompt, image_source, width, height, status, posted_url, image_url, media_key, media_type, created_at, updated_at, left(image_data, 32) AS image_data FROM creatives WHERE event_id = $1",
    [id],
  )).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return (
    <div className="space-y-6">
      <Card title="Marketing kit" description="Poster, Instagram post & story, LinkedIn image, captions and hashtags per channel, and a Reels teaser storyboard. Posting needs President approval (SOP publicity rule).">
        <MarketingKit
          eventId={id}
          nano={nanoBananaEnabled()}
          blob={blobEnabled()}
          items={creatives.map((c) => ({
            id: c.id,
            kind: c.kind,
            channel: c.channel,
            title: c.title,
            caption: c.caption,
            hashtags: c.hashtags,
            image_prompt: c.image_prompt,
            image_source: c.image_source,
            width: c.width,
            height: c.height,
            status: c.status,
            posted_url: c.posted_url,
            href: imageHref(c),
            video: isVideo(c),
          }))}
        />
      </Card>
      <Card title="Promotion checklist" description="Instagram, LinkedIn, email and posters, dated back from the event. Posters only go up after SLE publicity approval.">
        <PromoChecklist items={items} />
      </Card>
    </div>
  );
}
