import { notFound } from "next/navigation";
import { getPublicShare } from "@/lib/share-links";

export default async function PublicSharePage({ params }: { params: { token: string } }) {
  const item = await getPublicShare(params.token);
  if (!item) notFound();

  const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Shared from LifeFlow AI</div>
        <h1 className="text-4xl font-bold">{item.title}</h1>
        <p className="text-sm text-muted-foreground">
          Shared by {item.sharedBy} · {item.category} · {item.viewCount} views
        </p>
        {item.aiMemory && (
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm">{item.aiMemory}</div>
        )}
        {item.summary && <p className="leading-relaxed text-muted-foreground">{item.summary}</p>}
        <div className="flex flex-wrap gap-2 text-xs">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-2 py-1">#{tag}</span>
          ))}
        </div>
        {item.sourceUrl && (
          <a href={item.sourceUrl} className="text-sm text-primary underline" target="_blank" rel="noreferrer">
            Open original source
          </a>
        )}
      </div>
    </div>
  );
}
