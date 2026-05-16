-- Set banner images for AI and High projects
UPDATE projects SET banner_url = '/banners/ai.png' WHERE slug = 'ai';
UPDATE projects SET banner_url = '/banners/high.png' WHERE slug = 'high';
