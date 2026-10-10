import { C2paService } from './c2pa.service';

describe('C2paService', () => {
  let service: C2paService;

  beforeEach(() => {
    service = new C2paService();
  });

  it('returns manifest with correct structure', async () => {
    const result = await service.embedManifest({
      title: 'Test',
      models: ['flux-dev'],
      generator: 'AI Video Factory',
      timestamp: '2026-01-01T00:00:00Z',
      hasLikeness: false,
    });

    expect(result.manifestId).toMatch(/^urn:c2pa:/);

    const manifest = JSON.parse(result.manifestJson);
    expect(manifest.claim_generator).toContain('AI Video Factory');
    expect(manifest.assertions).toHaveLength(3);
  });

  it('sets deepfake disclosure when hasLikeness is true', async () => {
    const result = await service.embedManifest({
      title: 'Deepfake Test',
      models: ['wan-2.5'],
      generator: 'AI Video Factory',
      timestamp: '2026-01-01T00:00:00Z',
      hasLikeness: true,
    });

    const manifest = JSON.parse(result.manifestJson);
    const generativeTool = manifest.assertions.find(
      (a: { label: string }) => a.label === 'c2pa.ai.generative_tool',
    );
    expect(generativeTool.data.description).toContain('AI Act Art. 50');
  });

  it('sets notAllowed for training-mining entries', async () => {
    const result = await service.embedManifest({
      title: 'Test',
      models: ['flux-dev'],
      generator: 'AI Video Factory',
      timestamp: '2026-01-01T00:00:00Z',
      hasLikeness: false,
    });

    const manifest = JSON.parse(result.manifestJson);
    const trainingMining = manifest.assertions.find(
      (a: { label: string }) => a.label === 'c2pa.training-mining',
    );
    expect(trainingMining.data.entries['c2pa.ai_generative_training'].use).toBe('notAllowed');
    expect(trainingMining.data.entries['c2pa.data_mining'].use).toBe('notAllowed');
  });

  it('generates unique manifestId on each call', async () => {
    const baseMetadata = {
      title: 'Test',
      models: ['flux-dev'],
      generator: 'AI Video Factory',
      timestamp: '2026-01-01T00:00:00Z',
      hasLikeness: false,
    };
    const r1 = await service.embedManifest(baseMetadata);
    const r2 = await service.embedManifest(baseMetadata);
    expect(r1.manifestId).not.toBe(r2.manifestId);
  });

  it('includes all model names in tools array', async () => {
    const result = await service.embedManifest({
      title: 'Multi-model',
      models: ['flux-dev', 'wan-2.5', 'kling-v2'],
      generator: 'AI Video Factory',
      timestamp: '2026-01-01T00:00:00Z',
      hasLikeness: false,
    });

    const manifest = JSON.parse(result.manifestJson);
    const generativeTool = manifest.assertions.find(
      (a: { label: string }) => a.label === 'c2pa.ai.generative_tool',
    );
    expect(generativeTool.data.tools).toHaveLength(3);
    expect(generativeTool.data.tools.map((t: { name: string }) => t.name)).toEqual([
      'flux-dev',
      'wan-2.5',
      'kling-v2',
    ]);
  });
});
