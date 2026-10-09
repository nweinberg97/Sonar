import { acceptTheme, listThemes, mergeTheme, renameTheme, themeQuotes } from "@/lib/data";
import { fail, handle, json } from "@/lib/http";
import { cleanText, isId, readJson, requireId } from "@/lib/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Every answer filed under this theme, across all Sonars. */
export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = requireId((await ctx.params).id);
    return json({ quotes: await themeQuotes(id) });
  });
}

/** { name } rename (merges if the name is taken) · { accept: true } · { mergeInto: id } */
export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = requireId((await ctx.params).id);
    const themes = await listThemes();
    if (!themes.some((t) => t.id === id)) return fail("We couldn't find that theme.", 404);
    const body = await readJson(req);
    if (body.mergeInto !== undefined) {
      if (!isId(body.mergeInto) || !themes.some((t) => t.id === body.mergeInto)) return fail("Pick a theme to merge into.", 400);
      await mergeTheme(id, body.mergeInto);
      return json({ id: body.mergeInto, themes: await listThemes() });
    }
    if (body.name !== undefined) {
      const kept = await renameTheme(id, cleanText(body.name, { max: 60, field: "Theme name" }));
      return json({ id: kept, themes: await listThemes() });
    }
    if (body.accept === true) {
      await acceptTheme(id);
      return json({ id, themes: await listThemes() });
    }
    return fail("Nothing to change.", 400);
  });
}
