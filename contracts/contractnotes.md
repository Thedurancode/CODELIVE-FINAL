# Contract Notes - Customer Service Agreement (CSA)

## Customer Service Agreement (CSA) Overview

The Customer Service Agreement (CSA) is a critical component of the DispoTree platform's compliance and onboarding process. This agreement ensures proper verification and authorization for all wholesalers conducting business through the platform.

## CSA Requirements

### When CSA is Signed
The CSA is signed only upon adding an LLC Profile and is required for **every LLC** the wholesaler uses to go under contract.

### Property Submission Process

When a property is being submitted, the wholesaler will be asked to:

1. **Select LLC on Purchase Agreement** from a drop down menu
   - This shows all previously verified LLCs for the wholesaler
   - Each LLC has been properly documented and verified in the system

2. **Add New LLC** option
   - Available when the wholesaler needs to use a new LLC entity
   - Triggers the LLC verification process

### New LLC Collection Process

When "Add New LLC" is selected, DispoTree will collect:

1. **LLC Certificate**
   - Official certificate of formation/registration
   - Must be current and in good standing
   - Verifies the legal existence of the entity

2. **Operating Agreement**
   - Complete operating agreement document
   - Shows authorized signers and their authority
   - Confirms who can bind the LLC to contracts

### Storage and Future Use

Once collected and verified:
- LLC documents are securely stored in the platform
- The LLC is added to the wholesaler's drop-down list
- The LLC can be selected for future property submissions without re-documentation
- All LLCs remain associated with the wholesaler's account

## Compliance Benefits

1. **Legal Authority Verification**
   - Ensures only authorized individuals can submit contracts
   - Prevents unauthorized contract execution

2. **Entity Validation**
   - Confirms LLC is properly formed and active
   - Reduces risk of dealing with invalid or expired entities

3. **Audit Trail**
   - Maintains complete record of all LLCs used by each wholesaler
   - Provides compliance documentation for regulatory requirements

4. **Streamlined Process**
   - One-time verification per LLC
   - Quick selection for subsequent deals
   - Reduced administrative overhead

## Implementation Notes

### Technical Requirements
- Secure document storage system
- LLC profile management interface
- Drop-down selection component with "Add New" option
- Document verification workflow

### User Experience Flow
```
Submit Property → Select LLC Dropdown → Choose Existing LLC OR
                                         Add New LLC →
                                         Upload Documents →
                                         Verify →
                                         Complete Submission
```

### Compliance Checklist
- [ ] CSA signed for each LLC
- [ ] LLC certificate on file
- [ ] Operating agreement on file
- [ ] Authorized signers verified
- [ ] Entity status confirmed (good standing)

## CSA Terms Summary

The Customer Service Agreement typically includes:
- Service terms and conditions
- Fee structure
- Compliance requirements
- Data usage policies
- Dispute resolution procedures
- Termination clauses

## HUBZU ASA (Auction Services Agreement)

### Overview
The HUBZU ASA is a document Hubzu requires the wholesaler to sign when sending a property for Auction on their platform. This is **property specific** and one ASA is required for each individual property sent to Hubzu.

### Key Requirements
- **Property Specific**: Each property submission requires its own ASA
- **Wholesaler Signature**: The wholesaler must sign for each property
- **Mandatory**: Cannot submit to Hubzu without a signed ASA

### ASA Process Flow
1. Property is selected for Hubzu submission
2. ASA is auto-generated with property details
3. **Yellow-highlighted sections** indicate what the wholesaler must complete
4. Wholesaler reviews and signs the ASA
5. Signed ASA is submitted with property to Hubzu
6. Property goes live on Hubzu platform

### ASA Contents
The ASA typically includes:
- Property identification details
- Auction terms and conditions
- Commission and fee structure
- Marketing and representation rights
- Closing procedures
- Default and remedy clauses
- Indemnification provisions

### Automation Opportunities
- **ASA Generation**: Auto-populate ASA with property data
- **E-Signature Integration**: Use DocuSign or similar for signatures
- **Status Tracking**: Monitor ASA signature status
- **Bulk Processing**: Handle multiple ASA requests efficiently

### Yellow-Highlighted Sections (Wholesaler Requirements)
Typically includes:
- Wholesaler contact information
- Property details confirmation
- Auction price acceptance terms
- Closing timeline agreement
- Marketing authorizations
- Signature and date fields

## Xome ASA (Auction Services Agreement)

### Overview
The Xome ASA is a document Xome requires when a wholesaler wants to auction their property on the Xome platform. Similar to Hubzu, this is **property specific** and one ASA is required for each individual property sent to Xome.

### Key Requirements
- **Property Specific**: Each property submission requires its own Xome ASA
- **Wholesaler Signature**: Must be signed by the wholesaler for each property
- **Mandatory**: Cannot submit to Xome without a signed ASA
- **Separate from Hubzu**: Even if Hubzu ASA is signed, a separate Xome ASA is still required

### Xome ASA Process Flow
1. Property is selected for Xome submission
2. Xome ASA is generated with property-specific details
3. Required sections are highlighted for wholesaler completion
4. Wholesaler reviews and signs the ASA
5. Signed ASA is submitted along with property to Xome
6. Property is approved and goes live on Xome auction platform

### ASA Contents (Xome Specific)
The Xome ASA typically includes:
- Property identification and legal description
- Auction service terms and conditions
- Commission structure and fee schedule
- Marketing and advertising authorizations
- Property disclosure requirements
- Closing and settlement procedures
- Default remedies and penalties
- Indemnification and liability clauses
- Xome-specific platform terms

### Unique Xome Requirements
- **Detailed Property Description**: More comprehensive than Hubzu
- **Marketing Photos**: Minimum photo requirements specified
- **Disclosure Checklists**: State-specific disclosure adherence
- **Reserve Price Settings**: Clear pricing parameters
- **Inspection Periods**: Defined access windows

### Automation Opportunities
- **Dual ASA Generation**: Auto-generate both Hubzu and Xome ASAs simultaneously
- **Field Mapping**: Map Dispotree data to both ASA formats
- **Bulk Submission**: Handle multiple properties for both platforms
- **Status Synchronization**: Track ASA status across platforms

### Wholesaler Completion Requirements
Typical highlighted sections:
- Wholesaler and LLC information
- Property address and legal description
- Auction pricing strategy (reserve, starting bid, BIN price)
- Inspection and showing availability
- Marketing authorization clauses
- Commission and fee acknowledgments
- Signature blocks with date

### Comparison: Hubzu vs Xome ASA

| Feature | Hubzu ASA | Xome ASA |
|---------|-----------|----------|
| Property Specific | Yes | Yes |
| Required per Property | Yes | Yes |
| Photo Requirements | Basic | Detailed |
| Marketing Clause | Standard | Extensive |
| Reserve Price | Required | Required |
| Inspection Period | Optional | Mandatory |
| Commission Structure | Fixed | Variable |

## Broker MSA (Marketing Services Agreement)

### Overview
The Broker MSA is a critical agreement signed between the **licensed Broker of that state** and the wholesaler. **VERY IMPORTANT:** This is property specific and one is required for **each property submitted through our platform**, regardless of where it will be sent (Hubzu, Xome, hedge funds, etc.).

### Key Requirements
- **Mandatory for ALL Properties**: No property can be submitted without a Broker MSA
- **State-Specific**: Must be with a broker licensed in the property's state
- **Property Specific**: One MSA required per property
- **Universal Requirement**: Applies to all submission channels (Hubzu, Xome, internal marketplace, funds)
- **Broker Participation**: Cannot proceed without licensed broker involvement

### Broker MSA Process Flow
1. Property is ready for submission
2. System identifies property's state
3. Licensed broker in that state is assigned or selected
4. Broker MSA is generated with property details
5. Wholesaler and Broker review and sign the MSA
6. Signed MSA is stored and attached to property
7. Property can now be submitted to any channel
8. MSA remains valid for that specific property throughout its lifecycle

### Why Broker MSA is Critical
- **Legal Compliance**: Many states require broker involvement in property marketing
- **License Protection**: Protects wholesaler from practicing real estate without a license
- **Platform Protection**: Ensures DispoTree operates within legal requirements
- **Market Access**: Enables access to MLS and broker-only channels
- **Consumer Protection**: Provides licensed oversight for transactions

### MSA Contents
The Broker MSA typically includes:
- Property identification and address
- Marketing services to be provided
- Commission structure and payment terms
- Duration of agreement
- Responsibilities of each party
- Compliance representations
- Indemnification clauses
- Termination provisions
- State-specific disclosures

### Broker Responsibilities Under MSA
- **Marketing Oversight**: Supervise all property marketing activities
- **Compliance Review**: Ensure all marketing complies with state laws
- **Documentation**: Provide necessary brokerage documentation
- **MLS Access**: Facilitate MLS listings when required
- **Transaction Coordination**: Oversee transaction processes when needed

### Wholesaler Obligations Under MSA
- **Commission Payment**: Agree to broker commission structure
- **Cooperation**: Provide necessary documentation promptly
- **Compliance**: Follow broker guidance on marketing requirements
- **Exclusivity**: Use assigned broker for all marketing activities for that property
- **Transparency**: Disclose all material facts about the property

### Commission Structure
Typical broker commissions:
- **Flat Fee**: Fixed amount per property
- **Percentage**: Percentage of final sale price
- **Hybrid**: Base fee plus percentage
- **Success-Based**: Commission paid only on successful sale
- **Range-Based**: Sliding scale based on property value

### State-Specific Requirements
Different states have varying requirements:
- **Florida**: Broker of record required for most marketing activities
- **Texas**: Specific disclosure and advertising rules
- **California**: Detailed supervision requirements
- **Illinois**: License law considerations for wholesalers
- **Arizona**: Specific marketing compliance rules

### Automation Opportunities
- **Broker Matching**: Automatically match properties with qualified brokers by state
- **MSA Generation**: Auto-populate MSA with property and party information
- **Commission Calculations**: Calculate commissions based on predefined structures
- **Compliance Checks**: Verify broker license status and requirements
- **Document Management**: Store and organize all MSA documents

### Integration with Other Agreements
The Broker MSA works in conjunction with:
- **CSA**: Verifies wholesaler LLC authority
- **Hubzu ASA**: Allows Hubzu submissions
- **Xome ASA**: Allows Xome submissions
- **Property Contracts**: Underlying wholesale agreements

### MSA Status Tracking
Track for each property:
- Broker assignment status
- MSA generation status
- Signature status (both parties)
- Commission amount
- Agreement effective dates
- Termination status

### Risk Management
- **License Verification**: Verify broker license is active and in good standing
- **E&O Insurance**: Ensure broker has errors and omissions coverage
- **Compliance Monitoring**: Regular reviews of broker activities
- **Documentation**: Maintain complete records of all MSA activities
- **Escalation**: Process for handling broker-related issues

### Broker Network Management
- **Broker Vetting**: Thorough review of broker qualifications
- **Performance Tracking**: Monitor broker effectiveness and compliance
- **Relationship Management**: Maintain strong broker relationships
- **Compensation**: Fair and timely broker compensation
- **Training**: Provide platform-specific training to brokers

## Complete Agreement Hierarchy for Property Submission

```
1. CSA (Customer Service Agreement)
   └── Signed once per LLC

2. Broker MSA (Marketing Services Agreement)
   └── Signed once per property with state-licensed broker

3. Platform ASAs (as needed)
   ├── Hubzu ASA (for Hubzu submissions)
   └── Xome ASA (for Xome submissions)
```

## Related Documents
- Individual CSA templates for each LLC
- LLC verification checklists
- Compliance monitoring procedures
- Document storage policies
- HUBZU ASA templates and samples
- Xome ASA templates and samples
- Broker MSA templates by state
- Broker qualification checklists
- State-specific compliance requirements
- ASA completion checklists (both platforms)
- Dual ASA workflow documentation
- Broker network management procedures
- Commission structure documentation