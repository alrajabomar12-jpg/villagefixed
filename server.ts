import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/[...path].ts";

const app = express();
const port = Number(process.env.PORT || 10000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "dist");

app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

app.all("/api/*", async (req: any, res: any) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error("API handler failure", error);
    if (!res.headersSent) res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Unexpected server error." } });
  }
});
app.all("/api", async (req: any, res: any) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error("API handler failure", error);
    if (!res.headersSent) res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Unexpected server error." } });
  }
});

app.use(express.static(distDir, { index: false }));
app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));

app.listen(port, "0.0.0.0", () => {
  console.log(`Village Central listening on port ${port}`);
});
