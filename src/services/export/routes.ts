import { Router } from "express";
import { DataExportService } from "./service";

const router = Router();
const exportService = new DataExportService();

router.get("/resources", async (_req, res) => {
  const resources = await exportService.getExportableResources();
  res.json({ data: resources });
});

router.post("/", async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required for data exports" });
  }

  const { resource, format, filters, fields, limit } = req.body;
  if (!resource || !format) {
    return res.status(400).json({ error: "resource and format are required" });
  }

  const result = await exportService.export({ resource, format, filters, fields, limit });

  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.setHeader("X-Export-Row-Count", result.rowCount.toString());
  res.send(result.data);
});

export { router as exportRouter };
