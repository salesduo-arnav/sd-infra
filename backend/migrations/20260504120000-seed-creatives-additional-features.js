'use strict';

const { v4: uuidv4 } = require('uuid');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM tools WHERE slug = 'creatives-micro-tool' AND deleted_at IS NULL`,
    );

    if (existing.length === 0) {
      console.log('Tool "creatives-micro-tool" not found; skipping additional features seed.');
      return;
    }

    const toolId = existing[0].id;

    const features = [
      { slug: 'variant_image_generation', name: 'Variant Image Generation', description: 'Number of variant images that can be generated (1 unit per image)' },
      { slug: 'variant_creation', name: 'Variant Creation Access', description: 'Access to the Product Variant generator (boolean gate)' },
      { slug: 'design_guide_auto_extract', name: 'Design Guide Auto Extract', description: '' },
      { slug: 'total_brand_story_image_generation', name: 'total_brand_story_image_generation', description: '' },
      { slug: 'brand_story_project_creation', name: 'brand_story_project_creation', description: '' },
      { slug: 'aplus_project_creation', name: 'A+ Project Creation', description: 'Number of A+ Image projects that can be created' },
      { slug: 'dp_project_creation', name: 'DP Project Creation', description: 'Number of DP Projects that can be created' },
      { slug: 'total_brand_store_image_generation', name: 'Total Brand Store Image Generation', description: '' },
      { slug: 'brand_store_project_creation', name: 'Brand Store Project Creation', description: '' },
    ];

    for (const feature of features) {
      await queryInterface.sequelize.query(
        `INSERT INTO features (id, tool_id, slug, name, description, created_at, updated_at)
         VALUES (:id, :toolId, :slug, :name, :description, :now, :now)
         ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING`,
        {
          replacements: {
            id: uuidv4(),
            toolId,
            slug: feature.slug,
            name: feature.name,
            description: feature.description,
            now,
          },
        }
      );
    }

    console.log(`Seeded ${features.length} additional features for creatives-micro-tool.`);
  },

  async down(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM tools WHERE slug = 'creatives-micro-tool' AND deleted_at IS NULL`,
    );

    if (existing.length === 0) return;

    const toolId = existing[0].id;

    const slugs = [
      'variant_image_generation',
      'variant_creation',
      'design_guide_auto_extract',
      'total_brand_story_image_generation',
      'brand_story_project_creation',
      'aplus_project_creation',
      'dp_project_creation',
      'total_brand_store_image_generation',
      'brand_store_project_creation',
    ];

    await queryInterface.bulkDelete('features', {
      tool_id: toolId,
      slug: slugs,
    });
  },
};
