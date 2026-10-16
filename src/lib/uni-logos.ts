/** Square crest for each seeded university (from each university's own site). */
const ICON: Record<string, string> = {
  uni_sunway: "/unis/sunway-icon.png",
  uni_taylors: "/unis/taylors-icon.png",
  uni_monash: "/unis/monash-icon.png",
  uni_um: "/unis/um-icon.png",
  uni_apu: "/unis/apu-icon.png",
  uni_ucsi: "/unis/ucsi-icon.png",
};

export const uniIcon = (id: string) => ICON[id] ?? null;
