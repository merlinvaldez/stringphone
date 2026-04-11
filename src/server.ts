import express from "express";
import "dotenv/config";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use("/health", (_req, res) => {
  res.json({ ok: true, service: "stringphone-backend" });
});

app.listen(port, () => {
  console.log(`StringPhone backend is listening on Port: ${port}`);
});
