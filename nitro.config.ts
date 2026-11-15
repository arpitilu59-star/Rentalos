import { defineConfig } from "nitro/config";
import { copyFile, mkdir, chmod } from "node:fs/promises";
import { basename, join } from "node:path";
import ffmpegPath from "ffmpeg-static";

export default defineConfig({
  traceDeps: ["ffmpeg-static"],
  vercel: { functions: { maxDuration: 300 } },
  hooks: {
    compiled: async (nitro) => {
      if (!nitro.options.node || !ffmpegPath) return;
      // Copy the dynamically resolved executable explicitly, once, after dependency tracing.
      const dir = join(nitro.options.output.serverDir, "node_modules", "ffmpeg-static");
      await mkdir(dir, { recursive: true });
      const executable = join(dir, basename(ffmpegPath));
      await copyFile(ffmpegPath, executable);
      await chmod(executable, 0o755);
      await copyFile(`${ffmpegPath}.LICENSE`, `${executable}.LICENSE`);
    },
  },
});
