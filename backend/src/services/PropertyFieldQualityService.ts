import PropertyFieldQuality from '../models/PropertyFieldQuality';

export type FieldQualityInput = {
  field: string;
  status: 'known' | 'unknown' | 'inferred';
  source?: string | null;
  confidence?: number | null;
  notes?: string | null;
};

class PropertyFieldQualityService {
  async list(propertyId: number): Promise<PropertyFieldQuality[]> {
    return PropertyFieldQuality.findAll({
      where: { propertyId },
      order: [['field', 'ASC']],
    });
  }

  async upsert(propertyId: number, records: FieldQualityInput[]): Promise<PropertyFieldQuality[]> {
    if (records.length === 0) {
      return [];
    }

    const payload = records.map((record) => ({
      propertyId,
      field: record.field,
      status: record.status,
      source: record.source ?? null,
      confidence: record.confidence ?? null,
      notes: record.notes ?? null,
    }));

    await PropertyFieldQuality.bulkCreate(payload, {
      updateOnDuplicate: ['status', 'source', 'confidence', 'notes', 'updatedAt'],
    });

    return this.list(propertyId);
  }
}

export const propertyFieldQualityService = new PropertyFieldQualityService();
export default propertyFieldQualityService;
