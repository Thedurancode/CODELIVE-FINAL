# Property Checklist System

## Overview

The Property Checklist System provides a dynamic, state-aware compliance checklist for every property. It automatically generates checklist items based on the property's state (Oklahoma, Texas, Florida, etc.) and current phase.

## Features

- ✅ **Dynamic Generation**: Checklist automatically adjusts based on property state and phase
- ✅ **Visual Status Indicators**: Icons and colors show completion status at a glance
- ✅ **Progress Tracking**: Overall and section-level progress bars
- ✅ **Blocking Detection**: Identifies critical items that block deal progression
- ✅ **Next Steps**: Intelligent suggestions for what to do next
- ✅ **Phase-Aware**: Only shows relevant items for current phase
- ✅ **Real-Time Updates**: Reflects current state of contacts, documents, and agreements

## Architecture

### Backend

**Service**: `PropertyChecklistService.ts`
- Generates dynamic checklists by comparing property data against state compliance config
- Calculates progress percentages
- Identifies blocking issues
- Generates next steps

**API Endpoints**:
- `GET /api/properties/:id/checklist` - Full checklist
- `GET /api/properties/:id/checklist/summary` - Lightweight summary

### Frontend

**Hook**: `use-property-checklist.ts`
- `usePropertyChecklist()` - Fetches full checklist
- `usePropertyChecklistSummary()` - Fetches summary only
- Helper functions for status icons and colors

**Components**:
- `PropertyChecklistButton.tsx` - Button with summary badge
- `PropertyChecklistDialog.tsx` - Full checklist modal

## Checklist Sections

### 1. LLC Setup (Phase 0)
- LLC Selected
- Articles of Organization / Certificate of Formation
- Operating Agreement / Company Agreement
- Authorized Signer Identified
- Client Services Agreement (CSA) Executed

### 2. Contacts (Various Phases)
Dynamic based on state requirements:
- **Oklahoma**: 8 contact types
- **Texas**: 8 contact types (with Grantor/Grantee terminology)
- **Florida**: 9 contact types (includes HOA/Condo)

### 3. Documents (Phase-Based)
Dynamic based on state and phase:
- **Oklahoma**: 9 documents (8-point disclosure)
- **Texas**: 9 documents (TREC forms, 3-point disclosure)
- **Florida**: 10 documents (FAR/BAR AS-IS, 6-point disclosure, HOA)

### 4. Agreements (Phase 7+)
- Marketing Services Agreement (MSA)
- Auction Services Agreement (ASA) - if using auction

### 5. Compliance Rules (Phase-Based)
- Phase 3: Contract validation
- Phase 4: Disclosure validation
- Phase 5: Overall compliance scoring
- Additional phase-specific rules

## Status Types

| Status | Icon | Color | Meaning |
|--------|------|-------|---------|
| `complete` | ✓ | Green | Item is complete |
| `partial` | ◐ | Yellow | Item is partially complete |
| `missing` | ✗ | Red | Item is missing |
| `pending` | ⏳ | Blue | Item not yet required (future phase) |
| `not_applicable` | — | Gray | Item not required for this property |

## Usage Examples

### Example 1: Add Checklist Button to Property Details Page

```tsx
// frontend/src/app/(dashboard)/deals/[id]/page.tsx

import { PropertyChecklistButton } from '@/components/property/PropertyChecklistButton';

export default function PropertyDetailsPage({ params }: { params: { id: string } }) {
  const propertyId = parseInt(params.id);

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Property Details</h1>

        {/* Add Checklist Button */}
        <PropertyChecklistButton
          propertyId={propertyId}
          showProgress={true}
        />
      </div>

      {/* Rest of property details */}
    </div>
  );
}
```

### Example 2: Add Checklist Badge to Property Card

```tsx
// frontend/src/components/property/PropertyCard.tsx

import { usePropertyChecklistSummary } from '@/hooks/use-property-checklist';
import { Badge } from '@/components/ui/badge';

export function PropertyCard({ property }: { property: Property }) {
  const { data: summary } = usePropertyChecklistSummary(property.id);

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{property.address}</h3>

        {/* Checklist Progress Badge */}
        {summary && (
          <Badge
            variant={summary.blockingCount > 0 ? 'destructive' : 'default'}
          >
            {summary.overallProgress}% Complete
          </Badge>
        )}
      </div>

      {/* Blocking Issues Alert */}
      {summary && summary.blockingCount > 0 && (
        <div className="text-sm text-red-600 mt-2">
          ⚠️ {summary.blockingCount} blocking issue{summary.blockingCount > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
```

### Example 3: Add Checklist Column to Property Table

```tsx
// frontend/src/app/(dashboard)/deals/page.tsx

import { PropertyChecklistButton } from '@/components/property/PropertyChecklistButton';

const columns = [
  // ... other columns
  {
    accessorKey: 'checklist',
    header: 'Checklist',
    cell: ({ row }) => (
      <PropertyChecklistButton
        propertyId={row.original.id}
        variant="ghost"
        size="sm"
        showProgress={true}
      />
    ),
  },
];
```

### Example 4: API Usage (External Integration)

```typescript
// Fetch full checklist
const response = await fetch(`/api/properties/123/checklist`);
const { data: checklist } = await response.json();

console.log(`Overall progress: ${checklist.overallProgress}%`);
console.log(`Blocking issues: ${checklist.blockingIssues.length}`);
console.log(`Next steps:`, checklist.nextSteps);

// Fetch lightweight summary
const summaryResponse = await fetch(`/api/properties/123/checklist/summary`);
const { data: summary } = await summaryResponse.json();

console.log(`${summary.completedCount} / ${summary.totalCount} items complete`);
```

## API Response Examples

### Full Checklist Response

```json
{
  "success": true,
  "data": {
    "propertyId": 123,
    "state": "TX",
    "currentPhase": 3,
    "overallStatus": "incomplete",
    "overallProgress": 65,
    "sections": {
      "llcSetup": {
        "name": "LLC Setup",
        "progress": 100,
        "items": [
          {
            "id": "llc-selected",
            "category": "llc",
            "name": "LLC Selected",
            "description": "An LLC entity must be selected for this property",
            "required": true,
            "phase": 0,
            "status": "complete",
            "blocking": true
          }
        ],
        "requiredCount": 4,
        "completedCount": 4
      },
      "contacts": {
        "name": "Contacts",
        "progress": 50,
        "items": [
          {
            "id": "contact-seller",
            "category": "contact",
            "name": "Property Seller (Grantor)",
            "description": "Required fields: Grantor Name, Entity Type, Signature Verified",
            "required": true,
            "phase": 2,
            "status": "complete",
            "blocking": true
          },
          {
            "id": "contact-buyer",
            "category": "contact",
            "name": "End Buyer (Assignee/Grantee)",
            "description": "Required fields: Assignee Name, Entity Type, Contact Person",
            "required": true,
            "phase": 11,
            "status": "pending",
            "blocking": true
          }
        ],
        "requiredCount": 4,
        "completedCount": 2
      }
    },
    "blockingIssues": [
      "Documents: TREC 1-4 Family Residential Contract - Phase 2 - contract"
    ],
    "nextSteps": [
      "🚨 BLOCKING: TREC 1-4 Family Residential Contract - Phase 2 - contract",
      "⚠️  Texas §5.069 Wholesale Disclosure - Phase 4 - disclosure"
    ]
  }
}
```

### Summary Response

```json
{
  "success": true,
  "data": {
    "propertyId": 123,
    "overallProgress": 65,
    "overallStatus": "incomplete",
    "blockingCount": 1,
    "completedCount": 13,
    "totalCount": 20
  }
}
```

## State-Specific Behavior

### Oklahoma
- 8 disclosures required (8-point system)
- 42 compliance rules
- Cancellation timing validation
- Conservative risk tolerance

### Texas
- 3 disclosures required (Property Code §5.069)
- 30 compliance rules
- TREC forms with Grantor/Grantee terminology
- Option period tracking

### Florida
- 6 disclosures required (Consumer Protection §501.204)
- 35 compliance rules
- FAR/BAR AS-IS contract mandatory
- HOA/Condo disclosure tracking

## Testing

### Backend Testing

```bash
cd backend

# Test checklist generation
curl http://localhost:3001/api/properties/123/checklist

# Test summary endpoint
curl http://localhost:3001/api/properties/123/checklist/summary
```

### Frontend Testing

```bash
cd frontend

# Run dev server
npm run dev

# Navigate to property details page
open http://localhost:3000/deals/123

# Click "Checklist" button to see modal
```

## Extending the System

### Adding Custom Checklist Items

You can extend the checklist service to add custom validation logic:

```typescript
// backend/src/services/PropertyChecklistService.ts

private async generateCustomSection(property: any): Promise<ChecklistSection> {
  const items: ChecklistItem[] = [];

  // Add custom item
  items.push({
    id: 'custom-validation',
    category: 'custom',
    name: 'Custom Validation',
    description: 'Your custom requirement',
    required: true,
    phase: 5,
    status: await this.checkCustomCondition(property),
    blocking: true,
  });

  return {
    name: 'Custom Section',
    progress: calculateProgress(items),
    items,
    requiredCount: items.filter(i => i.required).length,
    completedCount: items.filter(i => i.required && i.status === 'complete').length,
  };
}
```

### Adding State-Specific Rules

State-specific rules are automatically loaded from the `state_compliance_configs` table. To add rules for a new state:

1. Create JSON spec file (e.g., `california-all.json`)
2. Import using script:
   ```bash
   npx ts-node src/scripts/importStateCompliance.ts compliance-specs/california-all.json
   ```
3. Checklist will automatically use the new state's rules

## Troubleshooting

### Checklist Not Loading

**Problem**: Checklist button shows loading spinner forever

**Solution**:
1. Check backend logs for errors
2. Verify state compliance config exists for property's state
3. Ensure property has valid state field

### Items Showing Wrong Status

**Problem**: Items marked as "complete" but showing as "missing"

**Solution**:
1. Check property associations are loaded correctly
2. Verify document/contact IDs match expected patterns
3. Clear React Query cache: `queryClient.invalidateQueries(['property-checklist'])`

### Blocking Issues Not Showing

**Problem**: Property has blocking issues but checklist shows as complete

**Solution**:
1. Verify compliance rules have `blocking: true` flag
2. Check current phase - rules only apply up to current phase
3. Ensure state config is loaded correctly

## Performance Optimization

### Caching Strategy

The checklist uses a 30-second cache via React Query:

```typescript
staleTime: 30000, // 30 seconds
refetchOnWindowFocus: true,
```

For properties with frequent updates, adjust caching:

```typescript
// Shorter cache for active deals
const { data } = usePropertyChecklist(propertyId, {
  staleTime: 10000, // 10 seconds
  refetchInterval: 30000, // Refetch every 30s
});
```

### Database Optimization

The service loads state compliance configs once per request. For high-traffic scenarios, consider caching configs in Redis:

```typescript
// backend/src/services/PropertyChecklistService.ts

private async loadStateConfig(state: string): Promise<any> {
  // Check Redis cache first
  const cached = await redis.get(`state-config:${state}`);
  if (cached) return JSON.parse(cached);

  // Load from database
  const config = await loadFromDB(state);

  // Cache for 1 hour
  await redis.setex(`state-config:${state}`, 3600, JSON.stringify(config));

  return config;
}
```

## Migration Guide

### Existing Projects

To add checklist system to existing Dispotree installation:

1. **Backend**:
   ```bash
   cd backend
   # Files are already created in src/services and src/routes
   # Routes auto-register in index.ts
   npm run dev
   ```

2. **Frontend**:
   ```bash
   cd frontend
   # Add checklist button to your property pages
   npm run dev
   ```

3. **Import State Configs**:
   ```bash
   cd backend
   npx ts-node src/scripts/importStateCompliance.ts compliance-specs/oklahoma-all.json
   npx ts-node src/scripts/importStateCompliance.ts compliance-specs/texas-all.json
   npx ts-node src/scripts/importStateCompliance.ts compliance-specs/florida-all.json
   ```

4. **Test**:
   - Navigate to a property details page
   - Click "Checklist" button
   - Verify checklist displays correctly

## License

Part of the Dispotree platform. See main LICENSE file.

---

**Last Updated**: January 2026
**Version**: 1.0.0
