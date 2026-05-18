/** Filename-safe slug (TASK-mvp-*, branch names, etc.). */
export function slugify(input: string, fallback = "task"): string {
  const cleaned = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : fallback;
}
