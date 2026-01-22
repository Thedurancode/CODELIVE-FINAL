/**
 * Document Workflow Templates
 *
 * Pre-built workflow templates for routing and processing classified documents.
 * These workflows are triggered when documents are classified and route them
 * to appropriate review and processing steps.
 */

import { Workflow } from '../types';

/**
 * Document Classification Routing Workflow
 *
 * Main entry point workflow that routes documents to type-specific workflows
 * based on their classification results.
 */
export function createDocumentClassificationWorkflow(): Workflow {
  return {
    id: 'template-document-classification',
    name: 'Document Classification Router',
    description: 'Routes classified documents to appropriate review workflows based on document type',
    enabled: true,
    steps: [
      {
        id: 'start',
        name: 'Start',
        type: 'start',
        config: {},
        nextSteps: [{ targetStepId: 'check_classification' }],
      },
      {
        id: 'check_classification',
        name: 'Check Classification Result',
        type: 'condition',
        config: {
          conditions: [
            { field: 'classification.success', operator: 'equals', value: true },
          ],
        },
        nextSteps: [
          {
            targetStepId: 'route_by_type',
            condition: {
              id: 'classified',
              field: 'classification.success',
              operator: 'equals',
              value: true,
            },
          },
          {
            targetStepId: 'manual_review',
            condition: {
              id: 'not_classified',
              field: 'classification.success',
              operator: 'equals',
              value: false,
            },
          },
        ],
      },
      {
        id: 'route_by_type',
        name: 'Route by Document Type',
        type: 'condition',
        config: {
          conditions: [
            { field: 'classification.classifiedType', operator: 'equals', value: 'contract' },
            { field: 'classification.classifiedType', operator: 'equals', value: 'inspection' },
            { field: 'classification.classifiedType', operator: 'equals', value: 'appraisal' },
            { field: 'classification.classifiedType', operator: 'equals', value: 'disclosure' },
            { field: 'classification.classifiedType', operator: 'equals', value: 'title' },
          ],
        },
        nextSteps: [
          {
            targetStepId: 'contract_workflow',
            condition: {
              id: 'is_contract',
              field: 'classification.classifiedType',
              operator: 'equals',
              value: 'contract',
            },
          },
          {
            targetStepId: 'inspection_workflow',
            condition: {
              id: 'is_inspection',
              field: 'classification.classifiedType',
              operator: 'equals',
              value: 'inspection',
            },
          },
          {
            targetStepId: 'appraisal_workflow',
            condition: {
              id: 'is_appraisal',
              field: 'classification.classifiedType',
              operator: 'equals',
              value: 'appraisal',
            },
          },
          {
            targetStepId: 'disclosure_workflow',
            condition: {
              id: 'is_disclosure',
              field: 'classification.classifiedType',
              operator: 'equals',
              value: 'disclosure',
            },
          },
          {
            targetStepId: 'title_workflow',
            condition: {
              id: 'is_title',
              field: 'classification.classifiedType',
              operator: 'equals',
              value: 'title',
            },
          },
          {
            targetStepId: 'catalog_photo',
            condition: {
              id: 'is_photo',
              field: 'classification.classifiedType',
              operator: 'equals',
              value: 'photo',
            },
          },
          {
            targetStepId: 'manual_review',
          },
        ],
      },
      // Contract processing workflow
      {
        id: 'contract_workflow',
        name: 'Process Contract',
        type: 'action',
        config: {
          action: 'process_contract',
          extractFields: true,
          validateSignatures: true,
          checkCompliance: true,
        },
        nextSteps: [{ targetStepId: 'check_contract_compliance' }],
      },
      {
        id: 'check_contract_compliance',
        name: 'Check Contract Compliance',
        type: 'condition',
        config: {
          conditions: [
            { field: 'contractResult.hasSignatures', operator: 'equals', value: true },
          ],
        },
        nextSteps: [
          {
            targetStepId: 'contract_complete',
            condition: {
              id: 'compliant',
              field: 'contractResult.hasSignatures',
              operator: 'equals',
              value: true,
            },
          },
          {
            targetStepId: 'contract_review_needed',
            condition: {
              id: 'needs_review',
              field: 'contractResult.hasSignatures',
              operator: 'equals',
              value: false,
            },
          },
        ],
      },
      {
        id: 'contract_review_needed',
        name: 'Contract Review Required',
        type: 'human_review',
        config: {
          reviewType: 'contract_review',
          timeout: 24 * 60 * 60 * 1000,
          notifyChannels: ['email', 'in_app'],
        },
        nextSteps: [{ targetStepId: 'contract_complete' }],
      },
      {
        id: 'contract_complete',
        name: 'Contract Processing Complete',
        type: 'action',
        config: {
          action: 'update_document_status',
          status: 'processed',
          notifyOwner: true,
        },
        nextSteps: [{ targetStepId: 'end' }],
      },
      // Inspection processing workflow
      {
        id: 'inspection_workflow',
        name: 'Process Inspection Report',
        type: 'action',
        config: {
          action: 'process_inspection',
          extractIssues: true,
          categorizeFindings: true,
        },
        nextSteps: [{ targetStepId: 'check_inspection_issues' }],
      },
      {
        id: 'check_inspection_issues',
        name: 'Check Inspection Issues',
        type: 'condition',
        config: {
          conditions: [
            { field: 'inspectionResult.hasMajorIssues', operator: 'equals', value: true },
          ],
        },
        nextSteps: [
          {
            targetStepId: 'inspection_review_needed',
            condition: {
              id: 'has_issues',
              field: 'inspectionResult.hasMajorIssues',
              operator: 'equals',
              value: true,
            },
          },
          {
            targetStepId: 'inspection_complete',
            condition: {
              id: 'no_issues',
              field: 'inspectionResult.hasMajorIssues',
              operator: 'equals',
              value: false,
            },
          },
        ],
      },
      {
        id: 'inspection_review_needed',
        name: 'Inspection Review Required',
        type: 'human_review',
        config: {
          reviewType: 'inspection_review',
          timeout: 48 * 60 * 60 * 1000,
          priority: 'high',
        },
        nextSteps: [{ targetStepId: 'inspection_complete' }],
      },
      {
        id: 'inspection_complete',
        name: 'Inspection Processing Complete',
        type: 'action',
        config: {
          action: 'update_document_status',
          status: 'processed',
          updateDealStatus: true,
        },
        nextSteps: [{ targetStepId: 'end' }],
      },
      // Appraisal processing workflow
      {
        id: 'appraisal_workflow',
        name: 'Process Appraisal',
        type: 'action',
        config: {
          action: 'process_appraisal',
          extractValue: true,
          compareToAskingPrice: true,
        },
        nextSteps: [{ targetStepId: 'check_appraisal_value' }],
      },
      {
        id: 'check_appraisal_value',
        name: 'Check Appraisal Value',
        type: 'condition',
        config: {
          conditions: [
            { field: 'appraisalResult.meetsMinimum', operator: 'equals', value: true },
          ],
        },
        nextSteps: [
          {
            targetStepId: 'appraisal_complete',
            condition: {
              id: 'value_ok',
              field: 'appraisalResult.meetsMinimum',
              operator: 'equals',
              value: true,
            },
          },
          {
            targetStepId: 'appraisal_review_needed',
            condition: {
              id: 'value_low',
              field: 'appraisalResult.meetsMinimum',
              operator: 'equals',
              value: false,
            },
          },
        ],
      },
      {
        id: 'appraisal_review_needed',
        name: 'Appraisal Value Review Required',
        type: 'human_review',
        config: {
          reviewType: 'appraisal_value_review',
          timeout: 24 * 60 * 60 * 1000,
        },
        nextSteps: [{ targetStepId: 'appraisal_complete' }],
      },
      {
        id: 'appraisal_complete',
        name: 'Appraisal Processing Complete',
        type: 'action',
        config: {
          action: 'update_document_status',
          status: 'processed',
          updateDealArv: true,
        },
        nextSteps: [{ targetStepId: 'end' }],
      },
      // Disclosure processing workflow
      {
        id: 'disclosure_workflow',
        name: 'Process Disclosure',
        type: 'action',
        config: {
          action: 'process_disclosure',
          extractDefects: true,
          checkCompleteness: true,
        },
        nextSteps: [{ targetStepId: 'check_disclosure_issues' }],
      },
      {
        id: 'check_disclosure_issues',
        name: 'Check Disclosure Issues',
        type: 'condition',
        config: {
          conditions: [
            { field: 'disclosureResult.hasSignificantIssues', operator: 'equals', value: true },
          ],
        },
        nextSteps: [
          {
            targetStepId: 'disclosure_review_needed',
            condition: {
              id: 'has_issues',
              field: 'disclosureResult.hasSignificantIssues',
              operator: 'equals',
              value: true,
            },
          },
          {
            targetStepId: 'disclosure_complete',
            condition: {
              id: 'no_issues',
              field: 'disclosureResult.hasSignificantIssues',
              operator: 'equals',
              value: false,
            },
          },
        ],
      },
      {
        id: 'disclosure_review_needed',
        name: 'Disclosure Review Required',
        type: 'human_review',
        config: {
          reviewType: 'disclosure_review',
          timeout: 24 * 60 * 60 * 1000,
        },
        nextSteps: [{ targetStepId: 'disclosure_complete' }],
      },
      {
        id: 'disclosure_complete',
        name: 'Disclosure Processing Complete',
        type: 'action',
        config: {
          action: 'update_document_status',
          status: 'processed',
        },
        nextSteps: [{ targetStepId: 'end' }],
      },
      // Title processing workflow
      {
        id: 'title_workflow',
        name: 'Process Title Document',
        type: 'action',
        config: {
          action: 'process_title',
          checkLiens: true,
          verifyOwnership: true,
        },
        nextSteps: [{ targetStepId: 'check_title_issues' }],
      },
      {
        id: 'check_title_issues',
        name: 'Check Title Issues',
        type: 'condition',
        config: {
          conditions: [
            { field: 'titleResult.hasLiens', operator: 'equals', value: true },
          ],
        },
        nextSteps: [
          {
            targetStepId: 'title_review_needed',
            condition: {
              id: 'has_liens',
              field: 'titleResult.hasLiens',
              operator: 'equals',
              value: true,
            },
          },
          {
            targetStepId: 'title_complete',
            condition: {
              id: 'no_liens',
              field: 'titleResult.hasLiens',
              operator: 'equals',
              value: false,
            },
          },
        ],
      },
      {
        id: 'title_review_needed',
        name: 'Title Review Required',
        type: 'human_review',
        config: {
          reviewType: 'title_review',
          timeout: 48 * 60 * 60 * 1000,
          priority: 'high',
        },
        nextSteps: [{ targetStepId: 'title_complete' }],
      },
      {
        id: 'title_complete',
        name: 'Title Processing Complete',
        type: 'action',
        config: {
          action: 'update_document_status',
          status: 'processed',
        },
        nextSteps: [{ targetStepId: 'end' }],
      },
      // Photo cataloging
      {
        id: 'catalog_photo',
        name: 'Catalog Photo',
        type: 'action',
        config: {
          action: 'catalog_photo',
          extractMetadata: true,
          generateThumbnail: true,
        },
        nextSteps: [{ targetStepId: 'end' }],
      },
      // Manual review fallback
      {
        id: 'manual_review',
        name: 'Manual Classification Required',
        type: 'human_review',
        config: {
          reviewType: 'document_classification',
          timeout: 72 * 60 * 60 * 1000,
          notifyChannels: ['email'],
        },
        nextSteps: [{ targetStepId: 'end' }],
      },
      {
        id: 'end',
        name: 'End',
        type: 'end',
        config: {},
        nextSteps: [],
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Get all document workflow templates
 */
export function getDocumentWorkflowTemplates(): Workflow[] {
  return [
    createDocumentClassificationWorkflow(),
  ];
}

/**
 * Get workflow ID for a document type
 */
export function getWorkflowIdForDocumentType(documentType: string): string {
  const workflowMap: Record<string, string> = {
    contract: 'contract_workflow',
    inspection: 'inspection_workflow',
    appraisal: 'appraisal_workflow',
    disclosure: 'disclosure_workflow',
    title: 'title_workflow',
    photo: 'catalog_photo',
    other: 'manual_review',
  };
  return workflowMap[documentType] || 'manual_review';
}

export default {
  createDocumentClassificationWorkflow,
  getDocumentWorkflowTemplates,
  getWorkflowIdForDocumentType,
};
