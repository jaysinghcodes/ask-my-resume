/**
 * Health check route: GET /health
 */

export function registerHealthRoute(app) {
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
}
