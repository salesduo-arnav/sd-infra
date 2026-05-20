'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Repoint the creatives-micro-tool feature catalog for credit metering.
 *
 *  1. Soft-deletes ALL existing active feature rows for the creatives tool
 *     (along with their dependent plan_limits / organization_entitlements
 *     rows). We don't know the full historical list of slugs across
 *     environments, so we sweep the entire active set rather than maintaining
 *     a hand-curated obsolete list.
 *  2. Inserts the 14 new feature slugs (12 credit-metered + 2 boolean-only
 *     entitlement gates: seo_intent_directives, rufus_cosmo). `use_credit_system`
 *     and `requires_subscription` are left at the column defaults
 *     (false / true respectively). Admins flip `use_credit_system` on
 *     per-feature from the AdminCredits page when they're ready to enable
 *     credit metering for that operation.
 *
 * Scoped to the creatives-micro-tool — other micro-tools' features are
 * untouched. Safe to re-run: step 1 is a no-op once nothing matches the new
 * slugs, and step 2 upserts on (tool_id, slug).
 */

// credit_cost: 0 for boolean entitlements — these are gated via the
// org's entitlement row (admin enable/disable on the plan) and do not
// debit the credit wallet. Their parent flow (seo_generation /
// seo_regeneration) owns the billable cost for the whole run.
const NEW_FEATURES = [
  { slug: 'seo_generation',                  name: 'SEO Generation (single + bulk)',                          credit_cost: 2 },
  { slug: 'seo_regeneration',                name: 'SEO Regeneration',                                          credit_cost: 2 },
  { slug: 'seo_intent_directives',           name: 'SEO Intent Directives (bucket-weakness prompt injection)',  credit_cost: 0 },
  { slug: 'rufus_cosmo',                     name: 'Rufus / Cosmo Intent Layer',                                credit_cost: 0 },
  { slug: 'dp_image_generation',             name: 'Detail Page Image Generation',                              credit_cost: 2 },
  { slug: 'basic_a_plus_generation',         name: 'Basic A+ Generation',                                       credit_cost: 4 },
  { slug: 'premium_a_plus_generation',       name: 'Premium A+ Generation',                                     credit_cost: 6 },
  { slug: 'main_image_generation',           name: 'Main Image Generation',                                     credit_cost: 3 },
  { slug: 'mobile_image_generation',         name: 'Mobile Image Generation',                                   credit_cost: 2 },
  { slug: 'variant_and_retrofit_generation', name: 'Variant & Retrofit Generation',                             credit_cost: 2 },
  { slug: 'image_regeneration',              name: 'Image Regeneration',                                        credit_cost: 1 },
  { slug: 'image_edit',                      name: 'Image Editor (AI edit / brandify / segment / logo)',        credit_cost: 1 },
  { slug: 'brand_store_generation',          name: 'Brand Store Generation',                                    credit_cost: 50 },
  { slug: 'brand_story_generation',          name: 'Brand Story Generation',                                    credit_cost: 25 },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [toolRows] = await queryInterface.sequelize.query(
      `SELECT id FROM tools WHERE slug = 'creatives-micro-tool' AND deleted_at IS NULL`,
    );
    if (toolRows.length === 0) {
      console.log('Tool "creatives-micro-tool" not found; skipping creatives credit-feature catalog update.');
      return;
    }
    const toolId = toolRows[0].id;

    // ---------------------------------------------------------------------
    // 1. Soft-delete ALL existing active feature rows for this tool, plus
    //    their dependent plan_limits / organization_entitlements rows.
    // ---------------------------------------------------------------------
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id, slug FROM features
        WHERE tool_id = :toolId AND deleted_at IS NULL`,
      { replacements: { toolId } },
    );

    if (existing.length > 0) {
      const featureIds = existing.map((r) => r.id);
      console.log(
        `[catalog] soft-deleting ${featureIds.length} existing creatives features: ${existing
          .map((r) => r.slug)
          .join(', ')}`,
      );

      await queryInterface.sequelize.query(
        `UPDATE plan_limits SET deleted_at = :now
          WHERE feature_id IN (:featureIds) AND deleted_at IS NULL`,
        { replacements: { featureIds, now } },
      );
      await queryInterface.sequelize.query(
        `UPDATE organization_entitlements SET deleted_at = :now
          WHERE feature_id IN (:featureIds) AND deleted_at IS NULL`,
        { replacements: { featureIds, now } },
      );
      await queryInterface.sequelize.query(
        `UPDATE features SET deleted_at = :now
          WHERE id IN (:featureIds) AND deleted_at IS NULL`,
        { replacements: { featureIds, now } },
      );
    } else {
      console.log('[catalog] no existing creatives features to soft-delete.');
    }

    // ---------------------------------------------------------------------
    // 2. Insert the 12 new credit-metered feature slugs. The active set was
    //    just cleared, so we just INSERT — no upsert juggling needed.
    // ---------------------------------------------------------------------
    for (const feat of NEW_FEATURES) {
      await queryInterface.sequelize.query(
        `INSERT INTO features (id, tool_id, slug, name, credit_cost, created_at, updated_at)
         VALUES (:id, :toolId, :slug, :name, :cost, :now, :now)`,
        {
          replacements: {
            id: uuidv4(),
            toolId,
            slug: feat.slug,
            name: feat.name,
            cost: feat.credit_cost,
            now,
          },
        },
      );
    }

    console.log(`[catalog] inserted ${NEW_FEATURES.length} credit-metered creatives features.`);
  },

  async down(queryInterface) {
    // Best-effort: soft-delete the rows this migration inserted. We can't
    // restore the previous catalog because we don't have a record of what
    // was there before.
    const [toolRows] = await queryInterface.sequelize.query(
      `SELECT id FROM tools WHERE slug = 'creatives-micro-tool' AND deleted_at IS NULL`,
    );
    if (toolRows.length === 0) return;
    const toolId = toolRows[0].id;

    const newSlugs = NEW_FEATURES.map((f) => f.slug);
    const now = new Date();
    await queryInterface.sequelize.query(
      `UPDATE features SET deleted_at = :now
        WHERE tool_id = :toolId AND slug IN (:slugs) AND deleted_at IS NULL`,
      { replacements: { toolId, slugs: newSlugs, now } },
    );
  },
};
