/**
 * Seed — currently a no-op.
 *
 * Originally seeded `products` + `product_price_mappings` for Truestock's
 * internal MIS revenue pipeline. The MIS module was removed 2026-05-22
 * when SeekPeak's scope narrowed to pure task management; both tables
 * are gone (see migration 0019_drop_mis.sql).
 *
 * If/when a fresh-install seed is needed for SaaS (a sample org, a few
 * sample tasks/projects for new tenants), add it here. For now this
 * file exists so `pnpm db:seed` doesn't error.
 */
import { config } from "dotenv";
config({ path: "../../.env" });

async function main() {
  console.log("→ db:seed — nothing to seed (MIS removed 2026-05-22). Exiting cleanly.");
}

main().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});
