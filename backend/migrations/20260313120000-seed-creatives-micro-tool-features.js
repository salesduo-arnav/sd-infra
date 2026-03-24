'use strict';

const { v4: uuidv4 } = require('uuid');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // Create the creatives-micro-tool if it doesn't exist
    const [toolResults] = await queryInterface.sequelize.query(
      `INSERT INTO tools (id, name, slug, description, is_active, tool_link, trial_card_required, trial_days, required_integrations, created_at, updated_at)
       VALUES (:id, :name, :slug, :description, true, :toolLink, false, 0, '[]'::jsonb, :now, :now)
       ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING
       RETURNING id`,
      {
        replacements: {
          id: uuidv4(),
          name: 'Creatives Micro Tool',
          slug: 'creatives-micro-tool',
          description: 'AI-powered creative generation tool for Amazon product listings',
          toolLink: 'http://creatives.lvh.me',
          now,
        },
      }
    );

    let toolId;
    if (toolResults.length > 0) {
      toolId = toolResults[0].id;
      console.log('Created tool "creatives-micro-tool".');
    } else {
      // Tool already exists, look it up
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM tools WHERE slug = 'creatives-micro-tool' AND deleted_at IS NULL`,
      );
      toolId = existing[0].id;
      console.log('Tool "creatives-micro-tool" already exists.');
    }

    const features = [
      // Project Creation (metered, monthly reset)
      { slug: 'dp_aplus_project_creation', name: 'DP/A+ Project Creation', description: 'Number of DP & A+ projects that can be created' },
      { slug: 'main_image_project_creation', name: 'Main Image Project Creation', description: 'Number of Main Image projects that can be created' },
      { slug: 'mobile_responsive_project_creation', name: 'Mobile Responsive Project Creation', description: 'Number of Mobile Responsive projects that can be created' },

      // Image Generation (metered, monthly reset)
      { slug: 'dp_image_generation', name: 'Detail Page Image Generation', description: 'Number of Detail Page images that can be generated' },
      { slug: 'basic_aplus_image_generation', name: 'Basic A+ Image Generation', description: 'Number of Basic A+ images that can be generated' },
      { slug: 'premium_aplus_image_generation', name: 'Premium A+ Image Generation', description: 'Number of Premium A+ images that can be generated' },
      { slug: 'main_image_generation', name: 'Main Image Generation', description: 'Number of Main product images that can be generated' },
      { slug: 'mobile_image_generation', name: 'Mobile Image Generation', description: 'Number of Mobile responsive images that can be generated' },
      { slug: 'total_image_generation', name: 'Total Image Generation', description: 'Cumulative limit across all image types' },

      // Advanced Features (boolean or metered)
      { slug: 'image_editor', name: 'Image Editor Access', description: 'Access to the image editor (boolean gate)' },
      { slug: 'ai_image_edit', name: 'AI Image Editing', description: 'Number of AI-powered image edits' },
      { slug: 'brandify_text', name: 'Brandify Text', description: 'Number of text brandification operations' },
      { slug: 'segment_object', name: 'Object Segmentation', description: 'Number of object segmentation operations' },
      { slug: 'logo_integration', name: 'Logo Integration', description: 'Number of logo integration operations' },
      { slug: 'image_regeneration', name: 'Image Regeneration', description: 'Number of image regenerations' },
      { slug: 'qa_agent', name: 'QA Agent', description: 'Access to QA agent checks (boolean gate)' },
    ];

    for (const feature of features) {
      const id = uuidv4();
      await queryInterface.sequelize.query(
        `INSERT INTO features (id, tool_id, slug, name, description, created_at, updated_at)
         VALUES (:id, :toolId, :slug, :name, :description, :now, :now)
         ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING`,
        {
          replacements: {
            id,
            toolId,
            slug: feature.slug,
            name: feature.name,
            description: feature.description,
            now,
          },
        }
      );
    }

    console.log(`Seeded ${features.length} features for creatives-micro-tool.`);
  },

  async down(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM tools WHERE slug = 'creatives-micro-tool' AND deleted_at IS NULL`,
    );

    if (existing.length === 0) return;

    const toolId = existing[0].id;

    const slugs = [
      'dp_aplus_project_creation', 'main_image_project_creation', 'mobile_responsive_project_creation',
      'dp_image_generation', 'basic_aplus_image_generation', 'premium_aplus_image_generation',
      'main_image_generation', 'mobile_image_generation', 'total_image_generation',
      'image_editor', 'ai_image_edit', 'brandify_text', 'segment_object', 'logo_integration',
      'image_regeneration', 'qa_agent',
    ];

    await queryInterface.bulkDelete('features', {
      tool_id: toolId,
      slug: slugs,
    });

    await queryInterface.bulkDelete('tools', {
      slug: 'creatives-micro-tool',
    });
  }
};
