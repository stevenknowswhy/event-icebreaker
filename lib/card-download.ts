import type { SharedProfile } from "./icebreaker";

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function cardFilename(name: string): string {
  const safeName =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "profile";
  return `${safeName}-icebreaker-card.png`;
}

export async function downloadVisualCard(
  profile: SharedProfile,
): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Card download is unavailable in this browser.");

  const gradient = context.createLinearGradient(0, 0, 1200, 720);
  gradient.addColorStop(0, "#17191e");
  gradient.addColorStop(1, "#08090b");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#c8ff2e";
  context.fillRect(0, 0, 18, canvas.height);
  context.font = "700 30px Arial, sans-serif";
  context.fillText("⚡ EVENT ICEBREAKER", 70, 72);

  context.fillStyle = "#f7f7f2";
  context.font = "700 76px Arial, sans-serif";
  context.fillText(profile.n, 70, 180);

  if (profile.r) {
    context.fillStyle = "#b6b8bd";
    context.font = "400 30px Arial, sans-serif";
    context.fillText(profile.r, 72, 230);
  }

  if (profile.s) {
    context.fillStyle = "#c8ff2e";
    context.font = "700 20px Arial, sans-serif";
    context.fillText("CURRENT SPARK", 72, 315);
    context.fillStyle = "#f7f7f2";
    context.font = "600 40px Arial, sans-serif";
    wrapText(context, `“${profile.s}”`, 1030)
      .slice(0, 3)
      .forEach((line, index) => context.fillText(line, 72, 370 + index * 50));
  }

  context.font = "600 22px Arial, sans-serif";
  let x = 72;
  const y = 585;
  for (const interest of profile.x.slice(0, 4)) {
    const width = context.measureText(interest).width + 44;
    context.fillStyle = "#282b31";
    context.beginPath();
    context.roundRect(x, y, width, 48, 24);
    context.fill();
    context.fillStyle = "#f7f7f2";
    context.fillText(interest, x + 22, y + 32);
    x += width + 12;
    if (x > 1050) break;
  }

  context.fillStyle = "#8b8e96";
  context.font = "400 20px Arial, sans-serif";
  context.fillText("Visual card works without an app or AI", 72, 680);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("The card image could not be created.");

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = cardFilename(profile.n);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
