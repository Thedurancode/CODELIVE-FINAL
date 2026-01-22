/**
 * Fraud Network Graph Service
 *
 * Graph-based network analysis for detecting fraud rings:
 * - Entity relationship tracking (seller, phone, email, address, IP)
 * - Fraud ring detection using connected components
 * - Shell company network identification
 * - Relationship strength scoring
 * - Community detection algorithms
 * - Visualization data export
 */

import * as crypto from 'crypto';
import { Op, Sequelize } from 'sequelize';
import FraudSignal from '../models/FraudSignal';
import Property from '../models/Property';
import { soc2AuditLogger } from './SOC2AuditLogger';
import { complianceEventStream } from './ComplianceEventStream';

// Graph node types
export type NodeType = 'seller' | 'phone' | 'email' | 'address' | 'ip' | 'wholesaler' | 'property';

// Graph node
export interface GraphNode {
  id: string;
  type: NodeType;
  value: string; // masked value for display
  valueHash: string;
  properties: Record<string, any>;
  riskScore: number;
  confirmedFraud: boolean;
  createdAt: Date;
  lastSeenAt: Date;
  occurrenceCount: number;
}

// Graph edge representing a relationship
export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'submitted_by' | 'contacted_via' | 'located_at' | 'connected_to' | 'same_deal';
  weight: number; // strength of connection (0-1)
  properties: Record<string, any>;
  createdAt: Date;
  lastSeenAt: Date;
  occurrenceCount: number;
}

// Fraud ring (connected component with fraud indicators)
export interface FraudRing {
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  riskScore: number;
  confirmedFraudCount: number;
  totalDeals: number;
  detectedAt: Date;
  status: 'active' | 'investigating' | 'confirmed' | 'cleared';
  metadata: Record<string, any>;
}

// Network analysis result
export interface NetworkAnalysisResult {
  nodeCount: number;
  edgeCount: number;
  connectedComponents: number;
  fraudRings: FraudRing[];
  centralityScores: Map<string, number>;
  clusteringCoefficient: number;
  density: number;
  riskScore: number;
  analysisId: string;
  timestamp: Date;
}

// Node with connections for path finding
interface NodeWithConnections {
  node: GraphNode;
  connections: Set<string>;
}

class FraudNetworkGraphService {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private adjacencyList: Map<string, Set<string>> = new Map();
  private initialized = false;
  private lastRebuild: Date | null = null;
  private rebuildInterval = 6 * 60 * 60 * 1000; // 6 hours

  constructor() {
    console.log('[FraudNetworkGraph] Service created');
  }

  /**
   * Initialize the graph service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('[FraudNetworkGraph] Building initial graph...');
      await this.rebuildGraph();
      this.initialized = true;

      // Schedule periodic rebuilds
      setInterval(() => this.rebuildGraph(), this.rebuildInterval);

      console.log('[FraudNetworkGraph] ✅ Service initialized');
    } catch (error) {
      console.error('[FraudNetworkGraph] ❌ Initialization failed:', error);
      this.initialized = true; // Still mark as initialized to allow manual rebuilds
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Rebuild the entire graph from database
   */
  async rebuildGraph(): Promise<void> {
    console.log('[FraudNetworkGraph] Rebuilding graph from database...');
    const startTime = Date.now();

    this.nodes.clear();
    this.edges.clear();
    this.adjacencyList.clear();

    // Load fraud signals
    const signals = await FraudSignal.findAll({
      where: {
        status: { [Op.in]: ['active', 'under_review', 'confirmed_fraud'] },
      },
      order: [['createdAt', 'DESC']],
      limit: 10000,
    });

    // Load recent properties for relationship building
    const properties = await Property.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5000,
    });

    // Build nodes from signals
    for (const signal of signals) {
      this.addNodeFromSignal(signal);
    }

    // Build nodes and edges from properties
    for (const property of properties) {
      await this.addPropertyToGraph(property);
    }

    this.lastRebuild = new Date();
    const elapsed = Date.now() - startTime;

    console.log(`[FraudNetworkGraph] Graph rebuilt: ${this.nodes.size} nodes, ${this.edges.size} edges (${elapsed}ms)`);
  }

  /**
   * Add a node from a fraud signal
   */
  private addNodeFromSignal(signal: FraudSignal): void {
    const nodeId = `${signal.entityType}_${signal.entityValueHash}`;

    if (this.nodes.has(nodeId)) {
      // Update existing node
      const node = this.nodes.get(nodeId)!;
      node.occurrenceCount += signal.occurrenceCount;
      node.riskScore = Math.max(node.riskScore, signal.riskScore);
      node.confirmedFraud = node.confirmedFraud || signal.status === 'confirmed_fraud';
      node.lastSeenAt = new Date(Math.max(node.lastSeenAt.getTime(), signal.updatedAt.getTime()));
    } else {
      // Create new node
      const node: GraphNode = {
        id: nodeId,
        type: signal.entityType as NodeType,
        value: this.maskValue(signal.entityValue, signal.entityType),
        valueHash: signal.entityValueHash,
        properties: signal.details as Record<string, any> || {},
        riskScore: signal.riskScore,
        confirmedFraud: signal.status === 'confirmed_fraud',
        createdAt: signal.createdAt,
        lastSeenAt: signal.updatedAt,
        occurrenceCount: signal.occurrenceCount,
      };
      this.nodes.set(nodeId, node);
      this.adjacencyList.set(nodeId, new Set());
    }
  }

  /**
   * Add a property and its relationships to the graph
   */
  private async addPropertyToGraph(property: Property): Promise<void> {
    const propertyNodeId = `property_${property.id}`;

    // Create property node
    if (!this.nodes.has(propertyNodeId)) {
      const node: GraphNode = {
        id: propertyNodeId,
        type: 'property',
        value: property.address || `Property #${property.id}`,
        valueHash: crypto.createHash('sha256').update(String(property.id)).digest('hex'),
        properties: {
          askingPrice: property.askingPrice,
          city: property.city,
          state: property.state,
        },
        riskScore: 0,
        confirmedFraud: false,
        createdAt: property.createdAt,
        lastSeenAt: property.updatedAt,
        occurrenceCount: 1,
      };
      this.nodes.set(propertyNodeId, node);
      this.adjacencyList.set(propertyNodeId, new Set());
    }

    // Create edges for related entities
    const entities = [
      { type: 'seller', value: property.sellerLlcName },
      { type: 'phone', value: property.sellerPhone },
      { type: 'email', value: property.sellerEmail },
      { type: 'address', value: property.address ? `${property.address} ${property.zip}` : null },
      { type: 'wholesaler', value: property.wholesalerLlcName },
    ];

    for (const entity of entities) {
      if (!entity.value) continue;

      const entityHash = crypto.createHash('sha256')
        .update(entity.value.toLowerCase().trim())
        .digest('hex');
      const entityNodeId = `${entity.type}_${entityHash}`;

      // Create entity node if not exists
      if (!this.nodes.has(entityNodeId)) {
        const entityNode: GraphNode = {
          id: entityNodeId,
          type: entity.type as NodeType,
          value: this.maskValue(entity.value, entity.type),
          valueHash: entityHash,
          properties: {},
          riskScore: 0,
          confirmedFraud: false,
          createdAt: property.createdAt,
          lastSeenAt: property.updatedAt,
          occurrenceCount: 1,
        };
        this.nodes.set(entityNodeId, entityNode);
        this.adjacencyList.set(entityNodeId, new Set());
      }

      // Create edge
      this.addEdge(propertyNodeId, entityNodeId, 'same_deal', {
        propertyId: property.id,
      });
    }

    // Connect entities that appear in the same deal
    const entityNodeIds = entities
      .filter(e => e.value)
      .map(e => {
        const hash = crypto.createHash('sha256')
          .update(e.value!.toLowerCase().trim())
          .digest('hex');
        return `${e.type}_${hash}`;
      });

    // Connect all entity pairs
    for (let i = 0; i < entityNodeIds.length; i++) {
      for (let j = i + 1; j < entityNodeIds.length; j++) {
        this.addEdge(entityNodeIds[i], entityNodeIds[j], 'connected_to', {
          via: 'same_deal',
          propertyId: property.id,
        });
      }
    }
  }

  /**
   * Add an edge between two nodes
   */
  private addEdge(
    sourceId: string,
    targetId: string,
    type: GraphEdge['type'],
    properties: Record<string, any> = {}
  ): void {
    // Ensure consistent edge ID (sorted to avoid duplicates)
    const [first, second] = [sourceId, targetId].sort();
    const edgeId = `${first}_${second}_${type}`;

    if (this.edges.has(edgeId)) {
      // Update existing edge
      const edge = this.edges.get(edgeId)!;
      edge.occurrenceCount++;
      edge.weight = Math.min(edge.weight + 0.1, 1);
      edge.lastSeenAt = new Date();
    } else {
      // Create new edge
      const edge: GraphEdge = {
        id: edgeId,
        sourceId: first,
        targetId: second,
        type,
        weight: 0.3,
        properties,
        createdAt: new Date(),
        lastSeenAt: new Date(),
        occurrenceCount: 1,
      };
      this.edges.set(edgeId, edge);
    }

    // Update adjacency list
    if (!this.adjacencyList.has(sourceId)) {
      this.adjacencyList.set(sourceId, new Set());
    }
    if (!this.adjacencyList.has(targetId)) {
      this.adjacencyList.set(targetId, new Set());
    }
    this.adjacencyList.get(sourceId)!.add(targetId);
    this.adjacencyList.get(targetId)!.add(sourceId);
  }

  /**
   * Analyze the network for fraud patterns
   */
  async analyzeNetwork(): Promise<NetworkAnalysisResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const analysisId = `analysis_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Find connected components
    const components = this.findConnectedComponents();

    // Identify fraud rings (components with fraud indicators)
    const fraudRings = this.identifyFraudRings(components);

    // Calculate centrality scores
    const centralityScores = this.calculateCentrality();

    // Calculate graph metrics
    const density = this.calculateDensity();
    const clusteringCoefficient = this.calculateClusteringCoefficient();

    // Overall risk score
    const riskScore = this.calculateNetworkRiskScore(fraudRings, centralityScores);

    const result: NetworkAnalysisResult = {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      connectedComponents: components.length,
      fraudRings,
      centralityScores,
      clusteringCoefficient,
      density,
      riskScore,
      analysisId,
      timestamp: new Date(),
    };

    // Log analysis
    soc2AuditLogger.log({
      eventType: 'fraud.network_analyzed',
      eventCategory: 'verification',
      severity: fraudRings.length > 0 ? 'warning' : 'info',
      actor: { type: 'system', name: 'FraudNetworkGraphService' },
      resource: { type: 'fraud_network', name: 'graph_analysis' },
      action: 'analyze_network',
      outcome: 'success',
      details: {
        analysisId,
        nodeCount: result.nodeCount,
        edgeCount: result.edgeCount,
        fraudRingsDetected: fraudRings.length,
        riskScore,
      },
    });

    // Emit event if fraud rings detected
    if (fraudRings.length > 0) {
      complianceEventStream.publish(
        'compliance.alert.created' as any,
        'alert',
        analysisId,
        {
          type: 'fraud_rings_detected',
          ringCount: fraudRings.length,
          riskScore,
          rings: fraudRings.map(r => ({
            id: r.id,
            nodeCount: r.nodes.length,
            riskScore: r.riskScore,
            confirmedFraudCount: r.confirmedFraudCount,
          })),
        },
        { source: 'system' }
      );
    }

    return result;
  }

  /**
   * Find connected components using BFS
   */
  private findConnectedComponents(): Set<string>[] {
    const visited = new Set<string>();
    const components: Set<string>[] = [];

    for (const nodeId of this.nodes.keys()) {
      if (visited.has(nodeId)) continue;

      const component = new Set<string>();
      const queue = [nodeId];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;

        visited.add(current);
        component.add(current);

        const neighbors = this.adjacencyList.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }

      if (component.size > 0) {
        components.push(component);
      }
    }

    return components;
  }

  /**
   * Identify fraud rings from connected components
   */
  private identifyFraudRings(components: Set<string>[]): FraudRing[] {
    const rings: FraudRing[] = [];

    for (const component of components) {
      // Only consider components with multiple nodes
      if (component.size < 3) continue;

      // Get nodes in this component
      const nodes: GraphNode[] = [];
      let confirmedFraudCount = 0;
      let totalRiskScore = 0;

      for (const nodeId of component) {
        const node = this.nodes.get(nodeId);
        if (node) {
          nodes.push(node);
          if (node.confirmedFraud) confirmedFraudCount++;
          totalRiskScore += node.riskScore;
        }
      }

      // Get edges within this component
      const edges: GraphEdge[] = [];
      for (const edge of this.edges.values()) {
        if (component.has(edge.sourceId) && component.has(edge.targetId)) {
          edges.push(edge);
        }
      }

      // Calculate ring risk score
      const avgRiskScore = totalRiskScore / nodes.length;
      const fraudRatio = confirmedFraudCount / nodes.length;
      const ringRiskScore = Math.min(
        avgRiskScore * 0.5 + fraudRatio * 100 * 0.3 + (nodes.length > 10 ? 20 : nodes.length * 2),
        100
      );

      // Only include if risk score is significant or has confirmed fraud
      if (ringRiskScore >= 30 || confirmedFraudCount > 0) {
        rings.push({
          id: `ring_${crypto.randomBytes(6).toString('hex')}`,
          nodes,
          edges,
          riskScore: Math.round(ringRiskScore),
          confirmedFraudCount,
          totalDeals: nodes.filter(n => n.type === 'property').length,
          detectedAt: new Date(),
          status: confirmedFraudCount > 0 ? 'investigating' : 'active',
          metadata: {
            componentSize: component.size,
            avgNodeRiskScore: avgRiskScore,
            // Prevent division by zero: density formula requires at least 2 nodes
            density: nodes.length >= 2
              ? edges.length / (nodes.length * (nodes.length - 1) / 2)
              : 0,
          },
        });
      }
    }

    // Sort by risk score
    rings.sort((a, b) => b.riskScore - a.riskScore);

    return rings;
  }

  /**
   * Calculate degree centrality for all nodes
   */
  private calculateCentrality(): Map<string, number> {
    const centrality = new Map<string, number>();
    const maxDegree = Math.max(
      ...Array.from(this.adjacencyList.values()).map(s => s.size),
      1
    );

    for (const [nodeId, neighbors] of this.adjacencyList) {
      centrality.set(nodeId, neighbors.size / maxDegree);
    }

    return centrality;
  }

  /**
   * Calculate graph density
   */
  private calculateDensity(): number {
    const n = this.nodes.size;
    if (n < 2) return 0;

    const maxEdges = (n * (n - 1)) / 2;
    return this.edges.size / maxEdges;
  }

  /**
   * Calculate average clustering coefficient
   */
  private calculateClusteringCoefficient(): number {
    let totalCoeff = 0;
    let count = 0;

    for (const [nodeId, neighbors] of this.adjacencyList) {
      if (neighbors.size < 2) continue;

      let triangles = 0;
      const neighborArray = Array.from(neighbors);

      for (let i = 0; i < neighborArray.length; i++) {
        for (let j = i + 1; j < neighborArray.length; j++) {
          const ni = neighborArray[i];
          const nj = neighborArray[j];
          if (this.adjacencyList.get(ni)?.has(nj)) {
            triangles++;
          }
        }
      }

      const possibleTriangles = (neighbors.size * (neighbors.size - 1)) / 2;
      totalCoeff += triangles / possibleTriangles;
      count++;
    }

    return count > 0 ? totalCoeff / count : 0;
  }

  /**
   * Calculate overall network risk score
   */
  private calculateNetworkRiskScore(
    fraudRings: FraudRing[],
    centrality: Map<string, number>
  ): number {
    if (fraudRings.length === 0) return 0;

    // Weight by ring size and risk
    let weightedScore = 0;
    let totalWeight = 0;

    for (const ring of fraudRings) {
      const weight = ring.nodes.length;
      weightedScore += ring.riskScore * weight;
      totalWeight += weight;
    }

    // Factor in high-centrality fraud nodes
    let highCentralityFraud = 0;
    for (const [nodeId, score] of centrality) {
      const node = this.nodes.get(nodeId);
      if (node?.confirmedFraud && score > 0.5) {
        highCentralityFraud++;
      }
    }

    const baseScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const centralityBonus = Math.min(highCentralityFraud * 5, 20);

    return Math.min(baseScore + centralityBonus, 100);
  }

  /**
   * Check if an entity is connected to confirmed fraud
   */
  async checkFraudConnection(
    entityType: NodeType,
    entityValue: string
  ): Promise<{
    connected: boolean;
    distance: number;
    path: GraphNode[];
    ringId?: string;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const entityHash = crypto.createHash('sha256')
      .update(entityValue.toLowerCase().trim())
      .digest('hex');
    const nodeId = `${entityType}_${entityHash}`;

    if (!this.nodes.has(nodeId)) {
      return { connected: false, distance: -1, path: [] };
    }

    // BFS to find shortest path to confirmed fraud
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; distance: number; path: string[] }> = [
      { nodeId, distance: 0, path: [nodeId] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.nodeId)) continue;

      visited.add(current.nodeId);

      const node = this.nodes.get(current.nodeId);
      if (node?.confirmedFraud && current.nodeId !== nodeId) {
        // Found a path to confirmed fraud
        const pathNodes = current.path.map(id => this.nodes.get(id)!).filter(Boolean);
        return {
          connected: true,
          distance: current.distance,
          path: pathNodes,
        };
      }

      const neighbors = this.adjacencyList.get(current.nodeId) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({
            nodeId: neighbor,
            distance: current.distance + 1,
            path: [...current.path, neighbor],
          });
        }
      }
    }

    return { connected: false, distance: -1, path: [] };
  }

  /**
   * Get the fraud ring containing an entity
   */
  async getEntityRing(
    entityType: NodeType,
    entityValue: string
  ): Promise<FraudRing | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    const entityHash = crypto.createHash('sha256')
      .update(entityValue.toLowerCase().trim())
      .digest('hex');
    const nodeId = `${entityType}_${entityHash}`;

    if (!this.nodes.has(nodeId)) {
      return null;
    }

    // Find the component containing this node
    const component = new Set<string>();
    const queue = [nodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      component.add(current);

      const neighbors = this.adjacencyList.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    // Build fraud ring from component
    const rings = this.identifyFraudRings([component]);
    return rings.length > 0 ? rings[0] : null;
  }

  /**
   * Add a new entity to the graph in real-time
   */
  async addEntity(
    type: NodeType,
    value: string,
    properties: Record<string, any> = {},
    connections?: Array<{ type: NodeType; value: string }>
  ): Promise<GraphNode> {
    const valueHash = crypto.createHash('sha256')
      .update(value.toLowerCase().trim())
      .digest('hex');
    const nodeId = `${type}_${valueHash}`;

    let node = this.nodes.get(nodeId);

    if (node) {
      // Update existing
      node.occurrenceCount++;
      node.lastSeenAt = new Date();
      Object.assign(node.properties, properties);
    } else {
      // Create new
      node = {
        id: nodeId,
        type,
        value: this.maskValue(value, type),
        valueHash,
        properties,
        riskScore: 0,
        confirmedFraud: false,
        createdAt: new Date(),
        lastSeenAt: new Date(),
        occurrenceCount: 1,
      };
      this.nodes.set(nodeId, node);
      this.adjacencyList.set(nodeId, new Set());
    }

    // Add connections
    if (connections) {
      for (const conn of connections) {
        const connHash = crypto.createHash('sha256')
          .update(conn.value.toLowerCase().trim())
          .digest('hex');
        const connNodeId = `${conn.type}_${connHash}`;

        // Ensure connected node exists
        if (!this.nodes.has(connNodeId)) {
          await this.addEntity(conn.type, conn.value);
        }

        this.addEdge(nodeId, connNodeId, 'connected_to', {});
      }
    }

    return node;
  }

  /**
   * Mark an entity as confirmed fraud
   */
  async markAsFraud(type: NodeType, value: string, userId: string): Promise<void> {
    const valueHash = crypto.createHash('sha256')
      .update(value.toLowerCase().trim())
      .digest('hex');
    const nodeId = `${type}_${valueHash}`;

    const node = this.nodes.get(nodeId);
    if (node) {
      node.confirmedFraud = true;
      node.riskScore = 100;

      // Propagate risk to connected nodes
      const neighbors = this.adjacencyList.get(nodeId) || new Set();
      for (const neighborId of neighbors) {
        const neighbor = this.nodes.get(neighborId);
        if (neighbor && !neighbor.confirmedFraud) {
          neighbor.riskScore = Math.min(neighbor.riskScore + 20, 80);
        }
      }

      soc2AuditLogger.log({
        eventType: 'fraud.entity_confirmed',
        eventCategory: 'decision',
        severity: 'critical',
        actor: { type: 'user', id: userId },
        resource: { type, name: this.maskValue(value, type) },
        action: 'confirm_fraud',
        outcome: 'success',
        details: { nodeId, connectedNodes: neighbors.size },
      });
    }
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    confirmedFraudNodes: number;
    avgDegree: number;
    lastRebuild: Date | null;
  } {
    let totalDegree = 0;
    let confirmedFraudCount = 0;

    for (const [nodeId, neighbors] of this.adjacencyList) {
      totalDegree += neighbors.size;
      const node = this.nodes.get(nodeId);
      if (node?.confirmedFraud) confirmedFraudCount++;
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      confirmedFraudNodes: confirmedFraudCount,
      avgDegree: this.nodes.size > 0 ? totalDegree / this.nodes.size : 0,
      lastRebuild: this.lastRebuild,
    };
  }

  /**
   * Export graph for visualization
   */
  exportForVisualization(): {
    nodes: Array<{
      id: string;
      label: string;
      type: NodeType;
      riskScore: number;
      confirmedFraud: boolean;
      size: number;
    }>;
    edges: Array<{
      source: string;
      target: string;
      weight: number;
    }>;
  } {
    const nodes = Array.from(this.nodes.values()).map(node => ({
      id: node.id,
      label: node.value,
      type: node.type,
      riskScore: node.riskScore,
      confirmedFraud: node.confirmedFraud,
      size: Math.min(node.occurrenceCount * 5 + 10, 50),
    }));

    const edges = Array.from(this.edges.values()).map(edge => ({
      source: edge.sourceId,
      target: edge.targetId,
      weight: edge.weight,
    }));

    return { nodes, edges };
  }

  /**
   * Mask value for display (privacy)
   */
  private maskValue(value: string, type: string): string {
    if (!value) return '';

    switch (type) {
      case 'phone':
        return value.length > 4 ? `***-***-${value.slice(-4)}` : '***';
      case 'email':
        const [local, domain] = value.split('@');
        return local ? `${local[0]}***@${domain || '***'}` : '***';
      case 'seller':
      case 'wholesaler':
        const parts = value.split(' ');
        return parts.map((p, i) => i === 0 ? p : `${p[0]}***`).join(' ');
      case 'ip':
        const ipParts = value.split('.');
        return ipParts.length === 4
          ? `${ipParts[0]}.${ipParts[1]}.***.***`
          : value.slice(0, 8) + '***';
      default:
        return value.length > 15 ? `${value.slice(0, 10)}...` : value;
    }
  }
}

export const fraudNetworkGraphService = new FraudNetworkGraphService();
export default fraudNetworkGraphService;
